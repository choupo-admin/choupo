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
  saltMixingModel -- everything the salt-mixtures page DRAWS, as pure
  functions of the reader's choices (DEV.md 4c C316).  The component only
  lays these out; tests/saltMixing.test.ts holds every number here.

  NaCl is salt "M" (cation Na), KCl is salt "N" (cation K) throughout.
\*---------------------------------------------------------------------------*/

import {
  errorsGPerKg, eutonic, fareloBinaryKgPerKg, fitMixing, isotherm, lnGammaPair,
  lnKspFromSolubility, lnKspVantHoff, MOLAR_MASS, saturationMolality,
  coolEutonicBrine, type ErrorSummary, type MixingFit, type PairSystem,
  type PitzerSaltRecord, type SaturatedRow,
} from "./saltMixingMath.js";
import {
  FARELO_2005_SYSTEMS, FARELO_TABLE2, FARELO_TERNARY, LITERATURE_MIXING,
  readKsp, readMixing, readPitzerSalt, thetaHolmes, toSaturatedRow,
  type Farelo05System, type Farelo93Row,
} from "./saltMixingData.js";

export const NACL = readPitzerSalt("Na", "Cl");
export const KCL = readPitzerSalt("K", "Cl");
export const THETA_CAT = readMixing("theta/K-Na");
export const PSI_CAT = readMixing("psi/K-Na-Cl");
export const KSP_NACL = readKsp("NaCl");
export const KSP_KCL = readKsp("KCl");

type Salt = "NaCl" | "KCl";
const recOf = (s: Salt): PitzerSaltRecord => (s === "NaCl" ? NACL : KCL);

/** Binary solubility from Farelo's Table 2 correlation, mol/kg water. */
export function measuredBinaryMolality(s: Salt, T: number): number {
  const mw = MOLAR_MASS[s]!;
  return fareloBinaryKgPerKg(FARELO_TABLE2[s].c, mw, T) * 1000 / mw;
}

/** ln K_sp anchored on the measured binary (the route the fits use). */
export const lnKspMeasured = (s: Salt, T: number): number =>
  lnKspFromSolubility(measuredBinaryMolality(s, T), T, recOf(s));

/** ln K_sp from the catalogue record (logK25 + van't Hoff dH). */
export const lnKspCatalogue = (s: Salt, T: number): number => {
  const k = s === "NaCl" ? KSP_NACL : KSP_KCL;
  return lnKspVantHoff(k.logK25, k.dH, T);
};

/** The binary solubility a K_sp predicts, mol/kg water. */
export function binaryFromKsp(s: Salt, T: number, lnK: number): number {
  const sys: PairSystem = { M: NACL, N: KCL, theta: 0, psi: 0 };
  return saturationMolality(s === "NaCl" ? "M" : "N", 0, T, sys, lnK);
}

// ---- models of the mixing --------------------------------------------------

export type ModelId = "zero" | "catalogue" | "pitzerKim" | "holmes" | "fit";

export const MODELS: readonly { id: ModelId; label: string; note: string }[] = [
  { id: "zero", label: "θ = ψ = 0",
    note: "binaries only: the pure prediction from single-salt data" },
  { id: "catalogue", label: "catalogue",
    note: `${THETA_CAT.file} and ${PSI_CAT.file}: θ = ${THETA_CAT.value}, ψ = ${PSI_CAT.value} (${THETA_CAT.source})` },
  { id: "pitzerKim", label: "Pitzer & Kim 1974",
    note: "θ = −0.012, ψ = −0.0018 from osmotic coefficients of the mixtures at 25 °C (Table I, p. 5704)" },
  { id: "holmes", label: "Holmes θ(T), ψ = 0",
    note: "θ = −6.726/T + 0.0039 (Holmes, Baes & Mesmer 1979, as Farelo et al. 1993 eq. 10 quote it), ψ = 0" },
  { id: "fit", label: "fitted here",
    note: "θ and ψ fitted to the rows within ±1.5 K of the temperature you chose" },
];

const pk = LITERATURE_MIXING.find((l) => l.system === "NaCl-KCl")!;

export function systemFor(model: ModelId, T: number, fit: MixingFit): PairSystem {
  switch (model) {
    case "zero": return { M: NACL, N: KCL, theta: 0, psi: 0 };
    case "catalogue": return { M: NACL, N: KCL, theta: THETA_CAT.value, psi: PSI_CAT.value };
    case "pitzerKim": return { M: NACL, N: KCL, theta: pk.theta, psi: pk.psi };
    case "holmes": return { M: NACL, N: KCL, theta: thetaHolmes(T), psi: 0 };
    case "fit": return { M: NACL, N: KCL, theta: fit.theta, psi: fit.psi };
  }
}

// ---- the measured rows -----------------------------------------------------

export interface MeasuredRow extends SaturatedRow { src: Farelo93Row }
export const ROWS: readonly MeasuredRow[] = FARELO_TERNARY.map((r) => ({ ...toSaturatedRow(r), src: r }));

const saltOfRow = (r: SaturatedRow): Salt => (r.sat === "M" ? "NaCl" : "KCl");
export const lnKspOfRow = (r: SaturatedRow): number => lnKspMeasured(saltOfRow(r), r.T);
export const molarMassOfRow = (r: SaturatedRow): number => MOLAR_MASS[saltOfRow(r)]!;

export const FIT_TEMPERATURES = [298.15, 323.15, 338.15] as const;
export const FIT_HALF_WIDTH = 1.5;
export const inWindow = (r: SaturatedRow, Tfit: number): boolean =>
  Math.abs(r.T - Tfit) <= FIT_HALF_WIDTH;

export interface FitReport {
  Tfit: number;
  fit: MixingFit;
  inRows: MeasuredRow[];
  outRows: MeasuredRow[];
}

export function fitAt(Tfit: number, fitPsi: boolean): FitReport {
  const inRows = ROWS.filter((r) => inWindow(r, Tfit));
  const outRows = ROWS.filter((r) => !inWindow(r, Tfit));
  const fit = fitMixing(inRows, { M: NACL, N: KCL, theta: 0, psi: 0 }, lnKspOfRow, fitPsi);
  return { Tfit, fit, inRows, outRows };
}

export interface ModelScore {
  id: ModelId; label: string;
  thetaText: string; psi: number;
  window: ErrorSummary; outside: ErrorSummary; all: ErrorSummary;
}

/** Every model scored on the rows inside and outside the fit window. */
export function scoreModels(rep: FitReport): ModelScore[] {
  return MODELS.map((m) => {
    const sysOf = (r: SaturatedRow) => systemFor(m.id, r.T, rep.fit);
    const sum = (rows: readonly SaturatedRow[]) => {
      const e = errorsGPerKg(rows, sysOf, lnKspOfRow, molarMassOfRow);
      return { n: e.n, rms: e.rms, bias: e.bias, maxAbs: e.maxAbs };
    };
    const s0 = systemFor(m.id, 298.15, rep.fit);
    return {
      id: m.id, label: m.label,
      thetaText: m.id === "holmes" ? "−6.726/T + 0.0039" : String(s0.theta),
      psi: s0.psi,
      window: sum(rep.inRows), outside: sum(rep.outRows), all: sum(ROWS),
    };
  });
}

/** Per-row prediction for the data table and the residual figure. */
export function rowPredictions(model: ModelId, rep: FitReport): {
  row: MeasuredRow; predGkg: number; errGkg: number; inWindow: boolean }[] {
  return ROWS.map((row) => {
    const sys = systemFor(model, row.T, rep.fit);
    const m = saturationMolality(row.sat, row.mOther, row.T, sys, lnKspOfRow(row));
    const mm = molarMassOfRow(row);
    return { row, predGkg: m * mm, errGkg: (m - row.mSat) * mm, inWindow: inWindow(row, rep.Tfit) };
  });
}

/** Solubility of the saturating salt along T at a fixed content of the
 *  other salt (g/kg water) -- one curve of Farelo's Figures 3 and 4. */
export function branchCurve(
  sat: Salt, otherGkg: number, model: ModelId, fit: MixingFit, T0 = 293, T1 = 345, n = 26,
): { T: number[]; S: number[] } {
  const other: Salt = sat === "NaCl" ? "KCl" : "NaCl";
  const mOther = otherGkg / MOLAR_MASS[other]!;
  const T: number[] = [], S: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = T0 + (T1 - T0) * i / n;
    const sys = systemFor(model, t, fit);
    const m = saturationMolality(sat === "NaCl" ? "M" : "N", mOther, t, sys, lnKspMeasured(sat, t));
    T.push(t); S.push(m * MOLAR_MASS[sat]!);
  }
  return { T, S };
}

// ---- prediction 1: the common-ion effect at 298.15 K -----------------------

export interface CommonIonRow {
  kclGkg: number;
  /** full model with the chosen theta, psi */
  model: number;
  /** binaries only */
  zero: number;
  /** the common ion alone: gamma_Na and gamma_Cl frozen at the binary saturation */
  frozen: number;
  /** Farelo's row nearest 298.15 K at this KCl content (Table 3), or the
   *  Table 2 binary for 0 */
  measured: number;
  measuredT: number;
}

export function commonIonTable(model: ModelId, fit: MixingFit): CommonIonRow[] {
  const T = 298.15;
  const lnK = lnKspMeasured("NaCl", T);
  const mBin = measuredBinaryMolality("NaCl", T);
  const gBin = lnGammaPair(mBin, 0, T, NACL, KCL, 0, 0);
  return [0, 50, 100, 150].map((k) => {
    const mK = k / MOLAR_MASS.KCl!;
    const solve = (sys: PairSystem) => saturationMolality("M", mK, T, sys, lnK) * MOLAR_MASS.NaCl!;
    //  frozen gammas: m (m + mK) = K_sp / (g_Na g_Cl)|binary
    const P = Math.exp(lnK - gBin.lnM - gBin.lnX);
    const mFrozen = (-mK + Math.sqrt(mK * mK + 4 * P)) / 2;
    let measured = mBin * MOLAR_MASS.NaCl!, measuredT = T;
    if (k > 0) {
      const near = ROWS.filter((r) => r.sat === "M" && r.src.otherGkg === k)
        .sort((a, b) => Math.abs(a.T - T) - Math.abs(b.T - T))[0]!;
      measured = near.src.satGkg; measuredT = near.T;
    }
    return {
      kclGkg: k,
      model: solve(systemFor(model, T, fit)),
      zero: solve(systemFor("zero", T, fit)),
      frozen: mFrozen * MOLAR_MASS.NaCl!,
      measured, measuredT,
    };
  });
}

// ---- prediction 2: the eutonic --------------------------------------------

export function eutonicAt(T: number, model: ModelId, fit: MixingFit): { mM: number; mN: number } | null {
  return eutonic(T, systemFor(model, T, fit), lnKspMeasured("NaCl", T), lnKspMeasured("KCl", T));
}

export function isothermAt(T: number, model: ModelId, fit: MixingFit) {
  return isotherm(T, systemFor(model, T, fit), lnKspMeasured("NaCl", T), lnKspMeasured("KCl", T));
}

// ---- prediction 3: Farelo 2005's six systems -------------------------------

export interface SixSystemRow {
  sys: Farelo05System;
  computed: boolean;
  why: string;
  rows: { T: number; mSecond: number; measured: number; zero: number | null;
          lit: number | null; table: number; page: number }[];
  /** mean (measured - zero) / measured, percent */
  meanDevZeroPct: number | null;
  literature: { theta: number; psi: number; where: string } | null;
}

export function sixSystems(): SixSystemRow[] {
  return FARELO_2005_SYSTEMS.map((s) => {
    const lit = LITERATURE_MIXING.find((l) =>
      l.system === `${s.sat}-${s.second}`) ?? null;
    if (s.z2 !== 1) {
      return { sys: s, computed: false,
        why: "no Al-Cl Pitzer record in the catalogue; a 3:1 salt adds the "
          + "unsymmetric E_θ term; Al³⁺ hydrolyses (pH 1.5-2.8 in the paper)",
        rows: s.rows.map((r) => ({ T: r.T, mSecond: r.mSecond, measured: r.mSat,
          zero: null, lit: null, table: r.table, page: r.page })),
        meanDevZeroPct: null, literature: null };
    }
    const second = readPitzerSalt(s.cation2, "Cl");
    const main = recOf(s.sat);
    const rows = s.rows.map((r) => {
      const lnK = lnKspMeasured(s.sat, r.T);
      const sys = (theta: number, psi: number): PairSystem => ({ M: main, N: second, theta, psi });
      const zero = saturationMolality("M", r.mSecond, r.T, sys(0, 0), lnK);
      const litM = lit ? saturationMolality("M", r.mSecond, r.T, sys(lit.theta, lit.psi), lnK) : null;
      return { T: r.T, mSecond: r.mSecond, measured: r.mSat, zero, lit: litM,
        table: r.table, page: r.page };
    });
    const dev = rows.map((r) => 100 * (r.measured - r.zero!) / r.measured);
    return {
      sys: s, computed: true,
      why: `${main.file} and ${second.file}; K_sp from the measured binary (Farelo 1993 Table 2)`,
      rows,
      meanDevZeroPct: dev.reduce((a, b) => a + b, 0) / dev.length,
      literature: lit ? { theta: lit.theta, psi: lit.psi, where: lit.where } : null,
    };
  });
}

// ---- the design question ---------------------------------------------------

export function coolingDesign(Thot: number, Tcold: number, model: ModelId, fit: MixingFit) {
  //  A theta(T) model is evaluated at each end's own temperature.
  const r = coolEutonicBrine(Thot, Tcold, systemFor(model, Thot, fit), systemFor(model, Tcold, fit),
    (T) => lnKspMeasured("NaCl", T), (T) => lnKspMeasured("KCl", T));
  if (!r) return null;
  return {
    hot: r.hot,
    coldN: r.coldN,
    kclCrystallisedGkg: r.crystallisedN * MOLAR_MASS.KCl!,
    naclSaturationRatioCold: Math.exp(r.lnSRMcold),
  };
}
