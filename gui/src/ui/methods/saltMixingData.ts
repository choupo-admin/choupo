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
  saltMixingData -- what the salt-mixtures EduTool (DEV.md 4c C316) reads:

  (1) THE CATALOGUE, read where the engine reads it.  The single-salt Pitzer
      records (data/standards/parameters/Pitzer/pairs/), the K-Na mixing
      records (theta/, psi/) and the halite / sylvite mass-action constants
      (data/standards/components/NaCl.dat, KCl.dat) arrive as raw text through
      import.meta.glob and are parsed here, so no number of theirs is copied
      into this file.  A record that does not parse, or lacks a key the page
      needs, throws -- a page drawn on a silent zero would be worse.

  (2) THE MEASUREMENTS, transcribed.  Farelo, von Brachel & Offermann, Can. J.
      Chem. Eng. 71 (1993) 141-146, doi:10.1002/cjce.5450710119
      (~/Choupo-Literature/farelo1993-nacl-kcl-water-solid-liquid-
      equilibria.pdf), Tables 1-4; and four of the six systems of Farelo,
      Fernandes & Avelino, J. Chem. Eng. Data 50 (2005) 1470-1477,
      doi:10.1021/je050111j (~/Choupo-Literature/FatimaFarelo/farelo2005-
      solubilities-six-ternary-chloride-systems.pdf), the rows between 295
      and 301 K of Tables 1, 2, 5, 6, 8 and 9.

      HOW THEY WERE RE-READ (2026-11-11): the text layer was extracted with
      pdftotext -layout and every row then checked against the page rendered
      at 110-300 dpi.  The 1993 text layer misreads one cell: Table 4, first
      row, Delta = 0.21 in the text layer, 0.27 on the page; 0.27 is used.
      It also splits Table 1's KCl column (the 319.1 K row lands one line
      off); the page was followed.  No value was interpolated or rounded.

  UNITS, kept as published: the 1993 tables give g salt per kg water (the
  "(kg/kg_w)(10^3)" heading), the 2005 tables give mol/kg water.  The 1993
  "[KCl]" and "[NaCl]" columns are the second salt's content in the same
  unit, fixed at 50, 100 or 150; each row is the temperature at which the
  last crystal of the saturating salt dissolved (the visual polythermal
  method of Potter & Clynne), so a row is (T, second-salt content,
  saturating-salt solubility), never an isotherm.
\*---------------------------------------------------------------------------*/

import { parse, toJson, type JsonDict, type JsonValue } from "../../dict/index.js";
import { rawRecordFor } from "../../case/catalogue.js";
import { MOLAR_MASS, type PitzerSaltRecord, type SaturatedRow } from "./saltMixingMath.js";

// ---- (1) the catalogue -----------------------------------------------------

const PAIRS_RAW = import.meta.glob(
  "../../../../data/standards/parameters/Pitzer/pairs/{Na-Cl,K-Cl,NH4-Cl,Li-Cl}.dat",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const MIXING_RAW = import.meta.glob(
  "../../../../data/standards/parameters/Pitzer/{theta/K-Na,psi/K-Na-Cl}.dat",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const obj = (v: JsonValue | undefined): JsonDict | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JsonDict) : null;
const num = (d: JsonDict | null, k: string, where: string): number => {
  const v = d?.[k];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`saltMixingData: ${where} has no numeric '${k}'`);
  }
  return v;
};
const numOr = (d: JsonDict | null, k: string, dflt: number): number => {
  const v = d?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
};
const repoPath = (globKey: string) => globKey.replace(/^(\.\.\/)+/, "");

function rawOf(table: Record<string, string>, stem: string): { key: string; raw: string } {
  const key = Object.keys(table).find((k) => k.endsWith(`/${stem}.dat`));
  if (!key) throw new Error(`saltMixingData: catalogue record ${stem}.dat not bundled`);
  return { key, raw: table[key]! };
}

/** One single-salt record, parsed the way PitzerHMW.cpp readPair() reads it. */
export function readPitzerSalt(cation: string, anion: string): PitzerSaltRecord {
  const { key, raw } = rawOf(PAIRS_RAW, `${cation}-${anion}`);
  const j = toJson(parse(raw));
  const p = obj(j.parameters);
  const where = repoPath(key);
  const form = typeof j.tCorrelationForm === "string" ? j.tCorrelationForm : "";
  const hasSlopes = p !== null && typeof p.dbeta0_dT === "number";
  const rec: PitzerSaltRecord = {
    salt: `${cation}${anion}`, cation, anion,
    beta0: num(p, "beta0", where), beta1: num(p, "beta1", where),
    Cphi: num(p, "Cphi", where), alpha1: numOr(p, "alpha1", 2.0),
    tForm: form === "silvesterPitzer1977" ? "silvesterPitzer1977"
      : (hasSlopes ? "linearSlopes" : "none"),
    dbeta0_dT: numOr(p, "dbeta0_dT", 0), dbeta1_dT: numOr(p, "dbeta1_dT", 0),
    dCphi_dT: numOr(p, "dCphi_dT", 0),
    TvalidLo: numOr(p, "TvalidLo", 273.15), TvalidHi: numOr(p, "TvalidHi", 573.15),
    file: where,
    source: typeof j.source === "string" ? j.source : "",
  };
  if (numOr(p, "beta2", 0) !== 0) {
    throw new Error(`saltMixingData: ${where} carries a beta2; this page's sums omit it`);
  }
  if (rec.tForm === "silvesterPitzer1977") {
    const q = (i: number) => num(p, `sp_q${i}`, where);
    rec.spB0 = [q(1), q(2), q(3), q(4), q(5)];
    rec.spB1 = [q(6), q(9), q(10)];
    rec.spCp = [q(11), q(12), q(13), q(14)];
  }
  return rec;
}

/** A theta or psi record: its value, file and source. */
export interface MixingRecord { value: number; file: string; source: string }
export function readMixing(stem: "theta/K-Na" | "psi/K-Na-Cl"): MixingRecord {
  const { key, raw } = rawOf(MIXING_RAW, stem.split("/")[1]!);
  const j = toJson(parse(raw));
  return {
    value: num(j, "value", repoPath(key)),
    file: repoPath(key),
    source: typeof j.source === "string" ? j.source : "",
  };
}

/** The mass-action constant of a component's solid phase (halite, sylvite). */
export interface KspRecord { logK25: number; dH: number; source: string; file: string;
  phase: string; calorimetricDH?: number }
export function readKsp(component: "NaCl" | "KCl"): KspRecord {
  const raw = rawRecordFor(component);
  if (!raw) throw new Error(`saltMixingData: component ${component} not in the catalogue`);
  const j = toJson(parse(raw));
  const phases = obj(j.solidPhases);
  const phase = phases ? Object.keys(phases)[0] : undefined;
  const sp = phase ? obj(phases![phase]) : null;
  const eq = obj(sp?.equilibrium);
  const where = `data/standards/components/${component}.dat`;
  const cal = obj(obj(sp?.calorimetric)?.dissolutionEnthalpy);
  return {
    logK25: num(eq, "logK25", where), dH: num(eq, "dH", where),
    source: typeof eq?.source === "string" ? eq.source : "",
    file: where, phase: phase ?? "",
    calorimetricDH: typeof cal?.value === "number" ? cal.value : undefined,
  };
}

// ---- (2) the measurements --------------------------------------------------

export const FARELO_1993 = {
  cite: "Farelo, F.; von Brachel, G.; Offermann, H. (1993). Solid-liquid equilibria "
    + "in the ternary system NaCl-KCl-H2O. Can. J. Chem. Eng. 71, 141-146.",
  doi: "10.1002/cjce.5450710119",
  file: "~/Choupo-Literature/farelo1993-nacl-kcl-water-solid-liquid-equilibria.pdf",
} as const;

export const FARELO_2005 = {
  cite: "Farelo, F.; Fernandes, C.; Avelino, A. (2005). Solubilities for six ternary "
    + "systems: NaCl + NH4Cl + H2O, KCl + NH4Cl + H2O, NaCl + LiCl + H2O, KCl + LiCl + "
    + "H2O, NaCl + AlCl3 + H2O, and KCl + AlCl3 + H2O at T = (298 to 333) K. "
    + "J. Chem. Eng. Data 50, 1470-1477.",
  doi: "10.1021/je050111j",
  file: "~/Choupo-Literature/FatimaFarelo/farelo2005-solubilities-six-ternary-chloride-systems.pdf",
} as const;

/** Farelo 1993 Table 2 (p. 142): binary solubility constants and the
 *  standard deviation of each fit (sigma, kg/kg). */
export const FARELO_TABLE2 = {
  NaCl: { c: [-13.67464, 463.0429, 1.722856] as const, sigma: 2.52e-4 },
  KCl: { c: [15.55644, -1387.3460, -2.358350] as const, sigma: 3.91e-4 },
} as const;

/** Farelo 1993 Table 1 (p. 142): binary solubilities, [T K, g salt/kg water]. */
export const FARELO_TABLE1: Readonly<Record<"NaCl" | "KCl", readonly (readonly [number, number])[]>> = {
  NaCl: [
    [293.1, 358.49], [297.6, 358.59], [302.0, 360.02], [304.3, 361.04], [307.8, 361.71],
    [311.5, 362.75], [313.9, 363.31], [318.1, 365.00], [321.5, 366.07], [323.4, 367.01],
    [327.8, 368.70], [333.7, 371.52], [338.1, 372.85], [339.2, 373.24], [344.4, 375.38],
    [349.9, 378.16], [353.3, 379.78], [358.0, 382.11], [362.1, 384.04],
  ],
  KCl: [
    [293.5, 342.18], [298.1, 355.99], [303.8, 372.98], [308.0, 385.06], [314.3, 403.86],
    [319.1, 417.37], [323.5, 430.00], [327.9, 442.98], [332.5, 456.03], [337.4, 468.91],
    [341.9, 481.03], [346.5, 494.07], [352.7, 509.88], [358.3, 523.86], [362.9, 534.98],
  ],
};

/** One row of Farelo 1993 Table 3 or 4, as published: the saturating salt,
 *  T, the other salt's content and the solubility (both g/kg water), and the
 *  authors' own model deviation Delta (experimental - calculated, g/kg). */
export interface Farelo93Row {
  sat: "NaCl" | "KCl";
  T: number;
  otherGkg: number;
  satGkg: number;
  delta: number;
  table: 3 | 4;
}

const t3 = (T: number, k: number, s: number, d: number): Farelo93Row =>
  ({ sat: "NaCl", T, otherGkg: k, satGkg: s, delta: d, table: 3 });
const t4 = (T: number, k: number, s: number, d: number): Farelo93Row =>
  ({ sat: "KCl", T, otherGkg: k, satGkg: s, delta: d, table: 4 });

/** Tables 3 and 4 (p. 143), every row, in the published order. */
export const FARELO_TERNARY: readonly Farelo93Row[] = [
  t3(293.7, 50, 338.41, -0.48), t3(298.4, 50, 339.59, -0.32), t3(303.1, 50, 340.90, -0.19),
  t3(308.4, 50, 342.49, -0.05), t3(314.3, 50, 344.41, 0.01), t3(319.6, 50, 346.20, 0.04),
  t3(324.1, 50, 347.82, 0.00), t3(327.9, 50, 349.30, 0.02), t3(333.7, 50, 351.57, -0.13),
  t3(338.2, 50, 353.36, -0.31), t3(343.4, 50, 355.48, -0.54),
  t3(294.3, 100, 319.94, 0.51), t3(298.2, 100, 320.89, 0.59), t3(303.3, 100, 322.27, 0.65),
  t3(309.2, 100, 324.08, 0.69), t3(314.0, 100, 325.62, 0.65), t3(318.5, 100, 327.06, 0.57),
  t3(323.3, 100, 328.85, 0.56), t3(328.1, 100, 330.57, 0.36), t3(333.3, 100, 332.60, 0.13),
  t3(339.4, 100, 335.13, -0.10), t3(343.2, 100, 336.71, -0.29),
  t3(294.8, 150, 301.28, 0.86), t3(298.3, 150, 302.17, 0.84), t3(303.1, 150, 303.46, 0.80),
  t3(308.0, 150, 305.08, 0.81), t3(313.2, 150, 306.72, 0.70), t3(318.7, 150, 308.45, 0.51),
  t3(324.2, 150, 310.52, 0.33), t3(330.8, 150, 313.01, 0.01), t3(333.4, 150, 314.00, -0.15),
  t3(339.1, 150, 316.33, -0.56), t3(343.6, 150, 318.22, -0.84),
  t4(298.0, 50, 316.68, 0.27), t4(299.2, 50, 319.33, -0.21), t4(307.8, 50, 343.94, -0.09),
  t4(311.9, 50, 356.28, 0.63), t4(318.0, 50, 373.09, 0.19), t4(321.8, 50, 383.98, 0.44),
  t4(328.5, 50, 402.73, 0.57), t4(336.4, 50, 424.23, 0.45), t4(340.7, 50, 435.99, 0.63),
  t4(298.2, 100, 279.76, 0.63), t4(298.9, 100, 281.27, 0.23), t4(303.1, 100, 292.64, -0.07),
  t4(305.8, 100, 300.10, 0.29), t4(307.8, 100, 304.32, -0.94), t4(313.6, 100, 320.59, -0.54),
  t4(317.7, 100, 332.81, 0.47), t4(323.3, 100, 347.42, -0.25), t4(324.5, 100, 351.09, 0.16),
  t4(332.0, 100, 372.05, 0.77), t4(332.9, 100, 373.25, -0.75), t4(338.6, 100, 389.36, 0.30),
  t4(298.1, 150, 244.58, 0.52), t4(301.3, 150, 252.07, 0.30), t4(303.2, 150, 256.35, -0.58),
  t4(303.5, 150, 256.83, -0.87), t4(308.2, 150, 269.90, 0.09), t4(311.1, 150, 278.02, 0.13),
  t4(313.2, 150, 282.93, -0.20), t4(317.5, 150, 294.38, -0.14), t4(318.3, 150, 295.90, -0.46),
  t4(319.4, 150, 299.29, -0.16), t4(324.4, 150, 312.97, 0.12), t4(333.0, 150, 336.74, 0.98),
  t4(337.7, 150, 348.67, 0.41), t4(342.4, 150, 361.19, 0.31),
];

/** A 1993 row as a molality row for the math: NaCl is salt "M", KCl "N". */
export function toSaturatedRow(r: Farelo93Row): SaturatedRow {
  const satM = MOLAR_MASS[r.sat]!;
  const otherM = MOLAR_MASS[r.sat === "NaCl" ? "KCl" : "NaCl"]!;
  return {
    sat: r.sat === "NaCl" ? "M" : "N",
    T: r.T,
    mSat: r.satGkg / satM,
    mOther: r.otherGkg / otherM,
  };
}

/** The 2005 systems, the rows near 298 K (295-301 K).  Each row: the
 *  saturating salt's molality at a fixed molality of the second chloride. */
export interface Farelo05Row { T: number; mSecond: number; mSat: number; table: number; page: number }
export interface Farelo05System {
  id: string;
  label: string;
  sat: "NaCl" | "KCl";
  second: "NH4Cl" | "LiCl" | "AlCl3";
  /** the second chloride's cation, and its charge */
  cation2: string;
  z2: 1 | 3;
  rows: readonly Farelo05Row[];
}
export const FARELO_2005_SYSTEMS: readonly Farelo05System[] = [
  { id: "nacl-nh4cl", label: "NaCl + NH4Cl + water", sat: "NaCl", second: "NH4Cl",
    cation2: "NH4", z2: 1, rows: [
      { T: 297.5, mSecond: 0.9346, mSat: 5.7499, table: 1, page: 1471 },
      { T: 300.2, mSecond: 1.8697, mSat: 5.3728, table: 1, page: 1471 },
      { T: 298.7, mSecond: 2.8038, mSat: 4.9825, table: 1, page: 1471 },
      { T: 297.4, mSecond: 3.7390, mSat: 4.6257, table: 1, page: 1471 },
    ] },
  { id: "kcl-nh4cl", label: "KCl + NH4Cl + water", sat: "KCl", second: "NH4Cl",
    cation2: "NH4", z2: 1, rows: [
      { T: 296.8, mSecond: 0.9348, mSat: 4.3190, table: 2, page: 1471 },
      { T: 298.5, mSecond: 1.8704, mSat: 3.8419, table: 2, page: 1471 },
      { T: 297.4, mSecond: 2.8058, mSat: 3.4264, table: 2, page: 1471 },
      { T: 298.4, mSecond: 4.6749, mSat: 2.6741, table: 2, page: 1471 },
    ] },
  { id: "nacl-licl", label: "NaCl + LiCl + water", sat: "NaCl", second: "LiCl",
    cation2: "Li", z2: 1, rows: [
      { T: 300.6, mSecond: 1.09, mSat: 5.182, table: 6, page: 1473 },
      { T: 297.8, mSecond: 1.97, mSat: 4.286, table: 6, page: 1473 },
      { T: 300.0, mSecond: 3.91, mSat: 2.623, table: 6, page: 1473 },
      { T: 298.0, mSecond: 5.80, mSat: 1.398, table: 6, page: 1473 },
    ] },
  { id: "kcl-licl", label: "KCl + LiCl + water", sat: "KCl", second: "LiCl",
    cation2: "Li", z2: 1, rows: [
      { T: 298.3, mSecond: 1.00, mSat: 3.982, table: 5, page: 1472 },
      { T: 298.4, mSecond: 1.97, mSat: 3.346, table: 5, page: 1472 },
      { T: 297.2, mSecond: 3.93, mSat: 2.089, table: 5, page: 1472 },
      { T: 296.4, mSecond: 5.94, mSat: 1.286, table: 5, page: 1472 },
    ] },
  { id: "nacl-alcl3", label: "NaCl + AlCl3 + water", sat: "NaCl", second: "AlCl3",
    cation2: "Al", z2: 3, rows: [
      { T: 299.2, mSecond: 0.373, mSat: 5.027, table: 9, page: 1473 },
      { T: 298.0, mSecond: 0.555, mSat: 4.474, table: 9, page: 1473 },
      { T: 299.0, mSecond: 0.750, mSat: 3.912, table: 9, page: 1473 },
      { T: 299.0, mSecond: 0.984, mSat: 3.292, table: 9, page: 1473 },
    ] },
  { id: "kcl-alcl3", label: "KCl + AlCl3 + water", sat: "KCl", second: "AlCl3",
    cation2: "Al", z2: 3, rows: [
      { T: 298.5, mSecond: 0.375, mSat: 3.930, table: 8, page: 1473 },
      { T: 298.9, mSecond: 0.749, mSat: 3.032, table: 8, page: 1473 },
      { T: 297.5, mSecond: 1.13, mSat: 2.116, table: 8, page: 1473 },
      { T: 296.2, mSecond: 1.39, mSat: 1.502, table: 8, page: 1473 },
    ] },
];

/** The literature values of theta and psi this page sets the fit beside,
 *  each with where it was read.  Only values found in a PDF in
 *  ~/Choupo-Literature are listed. */
export const LITERATURE_MIXING = [
  { system: "NaCl-KCl", theta: -0.012, psi: -0.0018, T: "298.15 K",
    basis: "osmotic coefficients of the mixtures, I up to 4.8 mol/kg",
    where: "Pitzer & Kim, J. Am. Chem. Soc. 96 (1974) 5701, Table I, p. 5704 "
      + "(~/Choupo-Literature/pitzer1974-electrolytes-iv-mixed.pdf)" },
  { system: "NaCl-LiCl", theta: 0.012, psi: -0.003, T: "298.15 K",
    basis: "osmotic coefficients, I up to 6 mol/kg",
    where: "Pitzer & Kim (1974) Table I, p. 5704" },
  { system: "KCl-LiCl", theta: -0.022, psi: -0.010, T: "298.15 K",
    basis: "osmotic coefficients, I up to 4.8 mol/kg",
    where: "Pitzer & Kim (1974) Table I, p. 5704" },
] as const;

/** Holmes, Baes & Mesmer (1979) theta_NaK(T), as quoted by Farelo et al.
 *  (1993) eq. (10), p. 144, with psi_NaKCl = 0 -- the parameters their own
 *  model used. */
export const thetaHolmes = (T: number): number => -6.726 / T + 0.0039;
