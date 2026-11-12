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
  saltMixingMath -- the arithmetic of the salt-mixtures EduTool (DEV.md 4c
  C316), pure functions and nothing else.

  SCOPE, deliberately narrow: TWO 1:1 chlorides with a COMMON anion (NaCl +
  KCl, NaCl + NH4Cl, ...), in water, on the molality scale.  For that case the
  multi-ion Pitzer-HMW sums the engine evaluates (src/thermo/electrolyte/
  PitzerHMW.cpp, evaluate(), the cation and anion loops) reduce to a few
  terms, written out below term by term so a reader can match each one to
  the engine's loop:

    ln g_M = F + m_X (2 B_MX + Z C_MX) + S_C + m_N (2 theta + m_X psi)
    ln g_N = F + m_X (2 B_NX + Z C_NX) + S_C + m_M (2 theta + m_X psi)
    ln g_X = F + m_M (2 B_MX + Z C_MX) + m_N (2 B_NX + Z C_NX) + S_C
                 + m_M m_N psi
    F   = f_gamma(I) + m_M m_X B'_MX + m_N m_X B'_NX
    S_C = m_M m_X C_MX + m_N m_X C_NX,    C = C_phi / 2,    Z = 2 m_X,  I = m_X

  The like-charge E-theta term is zero here (Na+ and K+ carry the same
  charge, PitzerForm::Etheta), so theta is the whole cation-cation mixing
  term.  A beta2 is never carried: every record this page reads has beta2 0.

  The engine's own numbers are the reference: tests/saltMixing.test.ts holds
  lnGammaPair to the engine's gamma_Na, gamma_K and gamma_Cl from a recorded
  pitzerHMW speciate run, and the single-salt branch to the engine's
  pitzerActivity witness outputs.  This file never claims to be the engine.
\*---------------------------------------------------------------------------*/

/** Molar masses used to turn Farelo's g salt / kg water into molality. */
export const MOLAR_MASS: Readonly<Record<string, number>> = {
  NaCl: 58.443, KCl: 74.551, NH4Cl: 53.491, LiCl: 42.394,
};
export const M_WATER = 18.015;

/** One single-salt Pitzer record as the engine reads it (25 C surface plus
 *  the record's declared temperature form). */
export interface PitzerSaltRecord {
  salt: string;              // "NaCl"
  cation: string;            // "Na"
  anion: string;             // "Cl"
  beta0: number; beta1: number; Cphi: number; alpha1: number;
  /** "silvesterPitzer1977" (sp_q1..q14), "linearSlopes", or "none" (25 C only). */
  tForm: "silvesterPitzer1977" | "linearSlopes" | "none";
  dbeta0_dT: number; dbeta1_dT: number; dCphi_dT: number;
  spB0?: readonly number[]; spB1?: readonly number[]; spCp?: readonly number[];
  TvalidLo: number; TvalidHi: number;
  file: string;              // repository path of the record
  source: string;
}

const TR = 298.15;

/** SolventProperties::debyeHuckelFactor (src/thermo/electrolyte/
 *  SolventProperties.H): the dielectric/density factor on A_phi, clamped to
 *  273.15-573.15 K exactly as the engine clamps it. */
export function debyeHuckelFactor(T: number): number {
  const Tc = T < 273.15 ? 273.15 : (T > 573.15 ? 573.15 : T);
  const x = Tc - TR;
  return 1.0 + x * (1.67320874e-03 + x * (7.92300440e-06
    + x * (3.05989121e-08 + x * (-2.51844044e-10 + x * 7.57942218e-13))));
}

/** PitzerForm::aPhi -- the osmotic Debye-Hueckel slope, 0.3915 at 25 C. */
export function aPhi(T: number): number { return 0.3915 * debyeHuckelFactor(T); }

const sp30 = (q: readonly number[], T: number) =>
  q[0]! + q[1]! * (1 / T - 1 / TR) + q[2]! * Math.log(T / TR)
  + q[3]! * (T - TR) + q[4]! * (T * T - TR * TR);
const sp31 = (q: readonly number[], T: number) =>
  q[0]! + q[1]! * (T - TR) + q[2]! * (T * T - TR * TR);
const sp32 = (q: readonly number[], T: number) =>
  q[0]! + q[1]! * (1 / T - 1 / TR) + q[2]! * Math.log(T / TR) + q[3]! * (T - TR);

/** The virials at T: a DEVIATION from the 25 C surface, exactly zero at
 *  298.15 K -- the engine's Pair::applyT (PitzerHMW.cpp). */
export function virialsAt(s: PitzerSaltRecord, T: number): { beta0: number; beta1: number; Cphi: number } {
  if (T === TR || s.tForm === "none") return { beta0: s.beta0, beta1: s.beta1, Cphi: s.Cphi };
  if (s.tForm === "silvesterPitzer1977" && s.spB0 && s.spB1 && s.spCp) {
    return {
      beta0: s.beta0 + sp30(s.spB0, T) - sp30(s.spB0, TR),
      beta1: s.beta1 + sp31(s.spB1, T) - sp31(s.spB1, TR),
      Cphi: s.Cphi + sp32(s.spCp, T) - sp32(s.spCp, TR),
    };
  }
  return {
    beta0: s.beta0 + s.dbeta0_dT * (T - TR),
    beta1: s.beta1 + s.dbeta1_dT * (T - TR),
    Cphi: s.Cphi + s.dCphi_dT * (T - TR),
  };
}

const B_DH = 1.2;
const gFn = (x: number) => (x <= 0 ? 0 : 2 * (1 - (1 + x) * Math.exp(-x)) / (x * x));
const gpFn = (x: number) => (x <= 0 ? 0 : -2 * (1 - (1 + x + 0.5 * x * x) * Math.exp(-x)) / (x * x));

/** ln of the three ion activity coefficients in M X + N X + water, both
 *  salts 1:1 with the common anion X.  `theta` and `psi` are the mixing
 *  parameters theta_MN and psi_MNX; zero gives the pure prediction from the
 *  two binaries. */
export function lnGammaPair(
  mM: number, mN: number, T: number,
  M: PitzerSaltRecord, N: PitzerSaltRecord, theta: number, psi: number,
): { lnM: number; lnN: number; lnX: number } {
  const mX = mM + mN;
  if (mX <= 0) return { lnM: 0, lnN: 0, lnX: 0 };
  const I = mX, Z = 2 * mX, sI = Math.sqrt(I);
  const A = aPhi(T);
  const vM = virialsAt(M, T), vN = virialsAt(N, T);
  const BM = vM.beta0 + vM.beta1 * gFn(M.alpha1 * sI);
  const BN = vN.beta0 + vN.beta1 * gFn(N.alpha1 * sI);
  const BpM = vM.beta1 * gpFn(M.alpha1 * sI) / I;
  const BpN = vN.beta1 * gpFn(N.alpha1 * sI) / I;
  const CM = vM.Cphi / 2, CN = vN.Cphi / 2;
  const fGamma = -A * (sI / (1 + B_DH * sI) + (2 / B_DH) * Math.log(1 + B_DH * sI));
  const F = fGamma + mM * mX * BpM + mN * mX * BpN;
  const SC = mM * mX * CM + mN * mX * CN;
  return {
    lnM: F + mX * (2 * BM + Z * CM) + SC + mN * (2 * theta + mX * psi),
    lnN: F + mX * (2 * BN + Z * CN) + SC + mM * (2 * theta + mX * psi),
    lnX: F + mM * (2 * BM + Z * CM) + mN * (2 * BN + Z * CN) + SC + mM * mN * psi,
  };
}

/** ln gamma_+- of a single 1:1 salt at molality m. */
export function lnGammaPMSingle(m: number, T: number, s: PitzerSaltRecord): number {
  const g = lnGammaPair(m, 0, T, s, s, 0, 0);
  return 0.5 * (g.lnM + g.lnX);
}

// ---- solubility products ---------------------------------------------------

/** ln K_sp(T) from a record's mass-action constant and its van't Hoff
 *  enthalpy, the engine's form (SpeciationSolver.H: logK(T) = logK25 +
 *  dH/(R ln10) (1/298.15 - 1/T)). */
export function lnKspVantHoff(logK25: number, dH: number, T: number): number {
  const R = 8.314462618;
  return Math.LN10 * logK25 + (dH / R) * (1 / TR - 1 / T);
}

/** ln K_sp(T) of a 1:1 salt from a MEASURED binary solubility m_sat(T) and
 *  the single-salt Pitzer gamma_+- at that molality: K_sp = (m g_+-)^2. */
export function lnKspFromSolubility(mSat: number, T: number, s: PitzerSaltRecord): number {
  return 2 * Math.log(mSat) + 2 * lnGammaPMSingle(mSat, T, s);
}

/** Farelo, von Brachel & Offermann (1993), Table 2: binary solubility
 *  S = (M_s/M_w) x/(1-x), x = exp(C1 + C2/T + C3 ln T), in kg salt / kg water. */
export function fareloBinaryKgPerKg(c: readonly [number, number, number], Msalt: number, T: number): number {
  const x = Math.exp(c[0] + c[1] / T + c[2] * Math.log(T));
  return (Msalt / M_WATER) * x / (1 - x);
}

// ---- the saturation of one salt in the mixture -----------------------------

/** The two salts of one ternary system and its mixing parameters. */
export interface PairSystem {
  M: PitzerSaltRecord;     // first salt (its cation is "M")
  N: PitzerSaltRecord;     // second salt
  theta: number;
  psi: number;
}

/** ln (ion activity product / K_sp) of salt `which` at (mM, mN): zero on its
 *  saturation curve, positive when supersaturated. */
export function saturationLog(
  which: "M" | "N", mM: number, mN: number, T: number, sys: PairSystem, lnKsp: number,
): number {
  const g = lnGammaPair(mM, mN, T, sys.M, sys.N, sys.theta, sys.psi);
  const mX = mM + mN;
  const mi = which === "M" ? mM : mN;
  return Math.log(mi * mX) + (which === "M" ? g.lnM : g.lnN) + g.lnX - lnKsp;
}

/** The molality of salt `which` at saturation, the other salt held at
 *  `mOther` (mol/kg water), or NaN when there is none below 20 mol/kg.
 *
 *  The FIRST crossing is the physical one, and it is bracketed by stepping up
 *  in 0.25 mol/kg from the dilute end: a record with a negative C_phi (KCl's,
 *  extrapolated past its range) can bend the activity product back down at
 *  molalities far above saturation, so a fixed [0, 20] bracket may hold two
 *  roots or none.  Then bisection on ln m and one secant step. */
export function saturationMolality(
  which: "M" | "N", mOther: number, T: number, sys: PairSystem, lnKsp: number,
): number {
  const f = (m: number) => (which === "M"
    ? saturationLog("M", m, mOther, T, sys, lnKsp)
    : saturationLog("N", mOther, m, T, sys, lnKsp));
  let lo = 1e-4;
  let flo = f(lo);
  if (!(flo < 0)) return NaN;
  let hi = 0.25, fhi = f(hi);
  while (!(fhi > 0) && hi < 20) {
    if (fhi < 0) { lo = hi; flo = fhi; }
    hi += 0.25; fhi = f(hi);
  }
  if (!(flo < 0 && fhi > 0)) return NaN;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    const fm = f(mid);
    if (fm > 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    if (hi / lo - 1 < 1e-13) break;
  }
  return lo - flo * (hi - lo) / (fhi - flo);
}

/** The eutonic (invariant) point at T: both salts saturated.  Walk the M
 *  branch in the N molality and find where salt N saturates too. */
export function eutonic(
  T: number, sys: PairSystem, lnKspM: number, lnKspN: number,
): { mM: number; mN: number } | null {
  const h = (mN: number) => {
    const mM = saturationMolality("M", mN, T, sys, lnKspM);
    return saturationLog("N", mM, mN, T, sys, lnKspN);
  };
  let lo = 1e-4, hi = saturationMolality("N", 0, T, sys, lnKspN);
  if (!Number.isFinite(hi)) return null;
  let flo = h(lo), fhi = h(hi);
  if (!(flo < 0 && fhi > 0)) return null;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = h(mid);
    if (fm > 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    if (hi - lo < 1e-12) break;
  }
  const mN = 0.5 * (lo + hi);
  return { mM: saturationMolality("M", mN, T, sys, lnKspM), mN };
}

/** The two branches of the isotherm, for a phase diagram: the M branch from
 *  N = 0 to the eutonic, and the N branch from M = 0 to the eutonic. */
export function isotherm(
  T: number, sys: PairSystem, lnKspM: number, lnKspN: number, n = 24,
): { branchM: { mM: number; mN: number }[]; branchN: { mM: number; mN: number }[];
     eu: { mM: number; mN: number } | null } {
  const eu = eutonic(T, sys, lnKspM, lnKspN);
  const branchM: { mM: number; mN: number }[] = [];
  const branchN: { mM: number; mN: number }[] = [];
  if (!eu) return { branchM, branchN, eu };
  for (let i = 0; i <= n; i++) {
    const mN = eu.mN * i / n;
    branchM.push({ mM: saturationMolality("M", mN, T, sys, lnKspM), mN });
    const mM = eu.mM * i / n;
    branchN.push({ mM, mN: saturationMolality("N", mM, T, sys, lnKspN) });
  }
  return { branchM, branchN, eu };
}

// ---- measured rows, the fit and its errors ---------------------------------

/** One measured saturated solution: `sat` is the salt that crystallises,
 *  its molality `mSat`, the other salt at `mOther` (mol/kg water). */
export interface SaturatedRow {
  sat: "M" | "N";
  T: number;
  mSat: number;
  mOther: number;
}

/** The fit's design: ln K_sp minus the model's ln(ion activity product) at
 *  the MEASURED composition with theta = psi = 0 is LINEAR in (theta, psi):
 *    r = a_theta theta + a_psi psi,
 *    a_theta = 2 m_other,  a_psi = m_other m_X + m_M m_N.
 *  So the least-squares fit is two normal equations, not an iteration. */
export function fitDesignRow(
  row: SaturatedRow, sys: PairSystem, lnKsp: number,
): { r: number; aTheta: number; aPsi: number } {
  const base: PairSystem = { ...sys, theta: 0, psi: 0 };
  const mM = row.sat === "M" ? row.mSat : row.mOther;
  const mN = row.sat === "M" ? row.mOther : row.mSat;
  const r = -saturationLog(row.sat, mM, mN, row.T, base, lnKsp);
  const mX = mM + mN;
  return { r, aTheta: 2 * row.mOther, aPsi: row.mOther * mX + mM * mN };
}

export interface MixingFit {
  theta: number;
  psi: number;
  n: number;
  /** correlation coefficient of the two estimates (from the normal matrix):
   *  near -1 or +1 means one temperature cannot tell them apart. */
  corr: number | null;
  fitPsi: boolean;
}

/** Least squares on the activity residual, one or two parameters. */
export function fitMixing(
  rows: readonly SaturatedRow[], sys: PairSystem, lnKspOf: (row: SaturatedRow) => number,
  fitPsi: boolean,
): MixingFit {
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (const row of rows) {
    const d = fitDesignRow(row, sys, lnKspOf(row));
    s11 += d.aTheta * d.aTheta; s12 += d.aTheta * d.aPsi; s22 += d.aPsi * d.aPsi;
    t1 += d.aTheta * d.r; t2 += d.aPsi * d.r;
  }
  if (!fitPsi || rows.length < 2) {
    return { theta: s11 > 0 ? t1 / s11 : 0, psi: 0, n: rows.length, corr: null, fitPsi: false };
  }
  const det = s11 * s22 - s12 * s12;
  return {
    theta: (s22 * t1 - s12 * t2) / det,
    psi: (s11 * t2 - s12 * t1) / det,
    n: rows.length,
    corr: -s12 / Math.sqrt(s11 * s22),
    fitPsi: true,
  };
}

/** Predicted solubility of the saturating salt for one row, mol/kg water. */
export function predictRow(row: SaturatedRow, sys: PairSystem, lnKsp: number): number {
  return saturationMolality(row.sat, row.mOther, row.T, sys, lnKsp);
}

export interface ErrorSummary { n: number; rms: number; bias: number; maxAbs: number }

/** Errors (predicted - measured) in g salt per kg water -- Farelo's unit.
 *  `sysOf` gives the model at a row (a theta(T) model differs row by row). */
export function errorsGPerKg(
  rows: readonly SaturatedRow[], sysOf: (row: SaturatedRow) => PairSystem,
  lnKspOf: (row: SaturatedRow) => number,
  molarMassOf: (row: SaturatedRow) => number,
): ErrorSummary & { each: number[] } {
  const each = rows.map((r) => (predictRow(r, sysOf(r), lnKspOf(r)) - r.mSat) * molarMassOf(r));
  const n = each.length;
  if (n === 0) return { n, rms: NaN, bias: NaN, maxAbs: NaN, each };
  const rms = Math.sqrt(each.reduce((a, e) => a + e * e, 0) / n);
  const bias = each.reduce((a, e) => a + e, 0) / n;
  const maxAbs = each.reduce((a, e) => Math.max(a, Math.abs(e)), 0);
  return { n, rms, bias, maxAbs, each };
}

// ---- the design question: cooling a brine saturated in both ----------------

/** Cool a brine saturated in BOTH salts at Thot down to Tcold, with the
 *  amount of salt M (in solution) held: the solution follows the N branch at
 *  Tcold.  `sysHot` and `sysCold` differ only for a theta(T) model.  Returns what crystallises of N per kg water and whether M is
 *  still undersaturated at Tcold (log of its saturation ratio < 0). */
export function coolEutonicBrine(
  Thot: number, Tcold: number, sysHot: PairSystem, sysCold: PairSystem,
  lnKspM: (T: number) => number, lnKspN: (T: number) => number,
): { hot: { mM: number; mN: number }; coldN: number; crystallisedN: number;
     lnSRMcold: number } | null {
  const hot = eutonic(Thot, sysHot, lnKspM(Thot), lnKspN(Thot));
  if (!hot) return null;
  const coldN = saturationMolality("N", hot.mM, Tcold, sysCold, lnKspN(Tcold));
  if (!Number.isFinite(coldN)) return null;
  const lnSRMcold = saturationLog("M", hot.mM, coldN, Tcold, sysCold, lnKspM(Tcold));
  return { hot, coldN, crystallisedN: hot.mN - coldN, lnSRMcold };
}
