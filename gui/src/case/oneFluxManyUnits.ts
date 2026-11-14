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
  oneFluxManyUnits — the arithmetic of the `one-flux-many-units` EduTool: the
  forms in which a film coefficient, a Henry's-law constant and an overall
  coefficient are written, the conversions between them, the overall
  coefficient's failure on a curved equilibrium line, and a reaction in the
  liquid film (Hatta number, enhancement factor).

  NOTHING HERE IS NEW PHYSICS, AND NOTHING IS THE ENGINE'S.  Every relation is
  a definition or a closed form printed in a source the page lists, and each
  is written beside the equation number it was READ at:

    Treybal (1980)  Mass-Transfer Operations, 3rd ed.: Eqs. 3.3-3.6 and
                    Table 3.1 (printed pp. 48-49); Eqs. 5.1-5.19 (pp. 108-111);
                    the average-coefficient condition (p. 114).
    Seader et al. (2016) Separation Process Principles, 4th ed.: Eqs.
                    3-180 to 3-216 and Table 3.12 (pp. 76-80), Example 3.18
                    (pp. 79-80); Eqs. 6-128 to 6-132 (pp. 181-182).
    Sander (2015)   Compilation of Henry's law constants v4.0: Eqs. 1-16
                    and Tables 1-4 (pp. 4400-4403); Table 6 (pp. 4408, 4410).
    Taylor and Kooijman (2014) Mass Transfer in Distillation: Eqs. 3.44,
                    3.68, 3.77-3.82 (pp. 111, 115, 117).
    Missen, Mims and Saville (1999) Introduction to Chemical Reaction
                    Engineering and Kinetics: Eqs. 9.2-3 to 9.2-54 (pp.
                    240-253), Example 9-6 (pp. 253-255).

  Choupo's engine computes NONE of this page's numbers.  Where the engine
  uses one of these forms (the rate-based packed segment, the Henry record)
  the lesson text cites the line; this file only does the arithmetic a
  student would do on paper, so that a number on the page can be redone by
  hand from the formula printed beside it.

  Units: SI with MOLES (mol, m, s, Pa, K) inside; every unit a student types
  is converted at the door by an exact factor (1 ft = 0.3048 m, 1 lb =
  0.45359237 kg, 1 atm = 101325 Pa, 1 h = 3600 s are definitions).
\*---------------------------------------------------------------------------*/

/** Molar gas constant, J/(mol K) (CODATA 2018 exact value).  Sander's Table 4
 *  prints 8.314; with this value R T at 298.15 K is 2478.96 J/mol, the factor
 *  his Table 1 prints between H^cp and H^cc. */
export const R_GAS = 8.314462618;
export const ATM = 101325;                  // Pa, by definition
export const T_STD = 298.15;                // K, Sander's standard temperature
/** Sander's water density for Tables 1-3, kg/m3 (printed in their captions). */
export const RHO_W_SANDER = 997;
/** Molar mass of water, kg/mol, that reproduces Sander's Table 1 factor
 *  H^cp -> H^xp = 1.83089 atm^-1 to its six digits; the paper does not
 *  print M_w itself (0.0180153 x 101325 / 997 = 1.830891). */
export const M_W_SANDER = 0.0180153;

const FT = 0.3048, LB = 0.45359237, HOUR = 3600;

// ---- small helpers -----------------------------------------------------------

const SUPER: Readonly<Record<string, string>> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

/** A number to d significant figures, as the page prints it: plain between
 *  10^-3 and 10^4 (where toPrecision stays positional), otherwise m×10ⁿ. */
export function sig(v: number, d = 4): string {
  if (!Number.isFinite(v)) return v === Infinity ? "∞" : "—";
  const a = Math.abs(v);
  const s = v.toPrecision(d);
  if (a !== 0 && (a < 1e-3 || s.includes("e"))) {
    const [m, e] = v.toExponential(d - 1).split("e");
    return `${m}×10${String(Number(e)).split("").map((ch) => SUPER[ch] ?? ch).join("")}`;
  }
  return s;
}

/** The inverse of `sig`, for tests: "4.26×10⁹" -> 4.26e9. */
export function parseSig(t: string): number {
  const inv: Record<string, string> = {};
  for (const [k, v] of Object.entries(SUPER)) inv[v] = k;
  const m = /^(-?[0-9.]+)(?:×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?$/.exec(t.trim());
  if (!m) return NaN;
  const e = m[2] ? Number(m[2].split("").map((ch) => inv[ch] ?? ch).join("")) : 0;
  return Number(m[1]) * Math.pow(10, e);
}

/** The logarithmic mean (a - b)/ln(a/b); equal arguments return themselves. */
export function logMean(a: number, b: number): number {
  if (!(a > 0 && b > 0)) return NaN;
  if (Math.abs(a - b) <= 1e-12 * Math.max(a, b)) return 0.5 * (a + b);
  return (a - b) / Math.log(a / b);
}

/** Bisection on a bracket [lo, hi] where f changes sign; 200 halvings. */
export function bisect(f: (x: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  for (let k = 0; k < 200; k++) {
    const mid = 0.5 * (lo + hi), fm = f(mid);
    if (fm === 0) return mid;
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// ---- 1. film coefficients ------------------------------------------------------

/** The five forms of a film coefficient this page converts between, low-flux
 *  (equimolar counter-diffusion) definitions:
 *    gas    N = k_y Δy = k_c Δc = k_p Δp       (Seader 3-193, 3-201, Table 3.12)
 *    liquid N = k_x Δx = k_L Δc               (Seader 3-193, 3-200)
 *  `kc` is the gas coefficient per molar concentration and `kL` the liquid
 *  one; both are velocities. */
export type FormId = "ky" | "kc" | "kp" | "kx" | "kL";
export type Phase = "gas" | "liquid";

export const FORM_PHASE: Readonly<Record<FormId, Phase>> = {
  ky: "gas", kc: "gas", kp: "gas", kx: "liquid", kL: "liquid",
};

export interface UnitOpt { id: string; label: string; toSI: number }

const VELOCITY: readonly UnitOpt[] = [
  { id: "m/s", label: "m/s", toSI: 1 },
  { id: "cm/s", label: "cm/s", toSI: 0.01 },
  { id: "m/h", label: "m/h", toSI: 1 / HOUR },
  { id: "ft/h", label: "ft/h", toSI: FT / HOUR },
];
const PER_FRACTION: readonly UnitOpt[] = [
  { id: "mol/(m2 s)", label: "mol/(m² s)", toSI: 1 },
  { id: "kmol/(m2 s)", label: "kmol/(m² s)", toSI: 1000 },
  { id: "kmol/(m2 h)", label: "kmol/(m² h)", toSI: 1000 / HOUR },
  { id: "lbmol/(ft2 h)", label: "lbmol/(ft² h)", toSI: (1000 * LB) / (FT * FT * HOUR) },
];
const PER_PRESSURE: readonly UnitOpt[] = [
  { id: "mol/(m2 s Pa)", label: "mol/(m² s Pa)", toSI: 1 },
  { id: "kmol/(m2 s kPa)", label: "kmol/(m² s kPa)", toSI: 1 },
  { id: "kmol/(m2 h kPa)", label: "kmol/(m² h kPa)", toSI: 1 / HOUR },
  { id: "kmol/(m2 h atm)", label: "kmol/(m² h atm)", toSI: 1000 / (HOUR * ATM) },
  { id: "lbmol/(ft2 h atm)", label: "lbmol/(ft² h atm)", toSI: (1000 * LB) / (FT * FT * HOUR * ATM) },
];

export const FORM_UNITS: Readonly<Record<FormId, readonly UnitOpt[]>> = {
  ky: PER_FRACTION, kx: PER_FRACTION, kc: VELOCITY, kL: VELOCITY, kp: PER_PRESSURE,
};

/** The SI-with-moles unit each form is carried in. */
export const FORM_SI_UNIT: Readonly<Record<FormId, string>> = {
  ky: "mol/(m² s)", kx: "mol/(m² s)", kc: "m/s", kL: "m/s", kp: "mol/(m² s Pa)",
};

export const FORM_LABEL: Readonly<Record<FormId, string>> = {
  ky: "k_y  (gas, per mole fraction)",
  kc: "k_c  (gas, per concentration)",
  kp: "k_p  (gas, per partial pressure)",
  kx: "k_x  (liquid, per mole fraction)",
  kL: "k_L  (liquid, per concentration)",
};

/** The state a conversion needs.  T and P fix the gas molar density
 *  c_G = P/(R T) (ideal gas, Seader 3-201); cL is the liquid's total molar
 *  concentration c = ρ_L/M_L (Seader 3-200); a is the interfacial area per
 *  unit volume; the two log-means are the drift factors of a stagnant film. */
export interface FilmState {
  T: number;        // K
  P: number;        // Pa
  cL: number;       // mol/m3
  a: number;        // m2/m3
  yBLM: number;     // (y_B)_LM, gas film, between bulk and interface
  xBLM: number;     // (x_B)_LM, liquid film
}

export interface ConvRow {
  /** stable key */
  key: string;
  sym: string;
  meaning: string;
  value: number;    // SI with moles
  unit: string;
  how: string;
}

/** Gas molar density P/(R T), mol/m3. */
export const gasMolarDensity = (T: number, P: number): number => P / (R_GAS * T);

/** The low-flux k_y (gas) or k_x (liquid), mol/(m2 s), from any form. */
export function toMoleFractionForm(form: FormId, v: number, s: FilmState): number {
  switch (form) {
    case "ky": case "kx": return v;
    case "kc": return v * gasMolarDensity(s.T, s.P);       // k_y = k_c P/(R T)
    case "kp": return v * s.P;                              // k_y = k_p P
    case "kL": return v * s.cL;                             // k_x = k_L c
  }
}

export function stateRefusal(s: FilmState): string | null {
  if (!(s.T > 0)) return "the temperature must be above absolute zero";
  if (!(s.P > 0)) return "the pressure must be positive";
  if (!(s.cL > 0)) return "the liquid molar concentration must be positive";
  if (!(s.a > 0)) return "the interfacial area per volume must be positive";
  if (!(s.yBLM > 0 && s.yBLM <= 1)) return "(y_B)_LM lies in (0, 1]";
  if (!(s.xBLM > 0 && s.xBLM <= 1)) return "(x_B)_LM lies in (0, 1]";
  return null;
}

/** Every form of the coefficient of the given phase, per area and per volume,
 *  low-flux and stagnant-film, each row saying how it was obtained. */
export function convertFilm(form: FormId, valueSI: number, s: FilmState): ConvRow[] {
  const phase = FORM_PHASE[form];
  const base = toMoleFractionForm(form, valueSI, s);
  const rows: ConvRow[] = [];
  if (phase === "gas") {
    const cG = gasMolarDensity(s.T, s.P);
    const ky = base, kc = ky / cG, kp = ky / s.P;
    const from = form === "ky" ? "given" : form === "kc"
      ? `k_y = k_c c_G = k_c P/(R T), with c_G = ${sig(cG)} mol/m³`
      : `k_y = k_p P, with P = ${sig(s.P)} Pa`;
    rows.push({ key: "ky", sym: "k_y", meaning: "per mole fraction", value: ky, unit: "mol/(m² s)", how: from });
    rows.push({ key: "kc", sym: "k_c", meaning: "per molar concentration", value: kc, unit: "m/s",
      how: form === "kc" ? "given" : `k_c = k_y/c_G, with c_G = P/(R T) = ${sig(cG)} mol/m³` });
    rows.push({ key: "kp", sym: "k_p", meaning: "per partial pressure", value: kp, unit: "mol/(m² s Pa)",
      how: form === "kp" ? "given" : `k_p = k_y/P, with P = ${sig(s.P)} Pa` });
    rows.push({ key: "kys", sym: "k_y^s", meaning: "per mole fraction, A through stagnant B", value: ky / s.yBLM,
      unit: "mol/(m² s)", how: `k_y/(y_B)_LM, with (y_B)_LM = ${sig(s.yBLM)}` });
    rows.push({ key: "kya", sym: "k_y a", meaning: "per volume, per mole fraction", value: ky * s.a,
      unit: "mol/(m³ s)", how: `k_y × a, with a = ${sig(s.a)} m²/m³` });
    rows.push({ key: "kca", sym: "k_c a", meaning: "per volume, per concentration", value: kc * s.a,
      unit: "1/s", how: "k_c × a" });
    rows.push({ key: "kpa", sym: "k_p a", meaning: "per volume, per partial pressure", value: kp * s.a,
      unit: "mol/(m³ s Pa)", how: "k_p × a" });
  } else {
    const kx = base, kL = kx / s.cL;
    rows.push({ key: "kx", sym: "k_x", meaning: "per mole fraction", value: kx, unit: "mol/(m² s)",
      how: form === "kx" ? "given" : `k_x = k_L c, with c = ${sig(s.cL)} mol/m³` });
    rows.push({ key: "kL", sym: "k_L", meaning: "per molar concentration", value: kL, unit: "m/s",
      how: form === "kL" ? "given" : `k_L = k_x/c, with c = ${sig(s.cL)} mol/m³` });
    rows.push({ key: "kxs", sym: "k_x^s", meaning: "per mole fraction, A through stagnant B", value: kx / s.xBLM,
      unit: "mol/(m² s)", how: `k_x/(x_B)_LM, with (x_B)_LM = ${sig(s.xBLM)}` });
    rows.push({ key: "kxa", sym: "k_x a", meaning: "per volume, per mole fraction", value: kx * s.a,
      unit: "mol/(m³ s)", how: `k_x × a, with a = ${sig(s.a)} m²/m³` });
    rows.push({ key: "kLa", sym: "k_L a", meaning: "per volume, per concentration", value: kL * s.a,
      unit: "1/s", how: "k_L × a" });
  }
  return rows;
}

/** (y_B)_LM of a film between a bulk and an interface mole fraction of the
 *  transferring species A (Seader 3-203: the log mean of 1 - y_A). */
export const driftLogMean = (yAbulk: number, yAinterface: number): number =>
  logMean(1 - yAbulk, 1 - yAinterface);

/** Taylor and Kooijman's Eq. 3.82 for diffusion through a stagnant second
 *  component, N_1 = c k ln[(1 - x_1d)/(1 - x_10)], written as a ratio to the
 *  low-flux flux c k (x_10 - x_1d): it equals 1/(x_B)_LM exactly. */
export function stagnantFilmRatio(x10: number, x1d: number): number {
  return Math.log((1 - x1d) / (1 - x10)) / (x10 - x1d);
}

// ---- 2. Henry's law ----------------------------------------------------------------

/** Sander's seven variants (Sect. 2.4-2.5, Eqs. 1-16): four solubilities
 *  (aqueous over gas) and three volatilities (gas over aqueous). */
export type HenryForm = "Hcp" | "Hcc" | "Hxp" | "Hbp" | "KHpc" | "KHpx" | "KHcc";

export const HENRY_FORMS: readonly HenryForm[] = ["Hcp", "Hcc", "Hxp", "Hbp", "KHpc", "KHpx", "KHcc"];

export const HENRY_INFO: Readonly<Record<HenryForm, {
  plain: string; defn: string; kind: "solubility" | "volatility"; eq: string;
}>> = {
  Hcp: { plain: "H^cp", defn: "c_a/p", kind: "solubility", eq: "Sander Eq. 1" },
  Hcc: { plain: "H^cc", defn: "c_a/c_g", kind: "solubility", eq: "Sander Eqs. 2-3" },
  Hxp: { plain: "H^xp", defn: "x/p", kind: "solubility", eq: "Sander Eqs. 4-6" },
  Hbp: { plain: "H^bp", defn: "b/p", kind: "solubility", eq: "Sander Eqs. 7-11" },
  KHpc: { plain: "K_H^pc", defn: "p/c_a", kind: "volatility", eq: "Sander Eq. 14" },
  KHpx: { plain: "K_H^px", defn: "p/x", kind: "volatility", eq: "Sander Eq. 15" },
  KHcc: { plain: "K_H^cc", defn: "c_g/c_a", kind: "volatility", eq: "Sander Eq. 16" },
};

export const HENRY_UNITS: Readonly<Record<HenryForm, readonly UnitOpt[]>> = {
  Hcp: [
    { id: "mol/(m3 Pa)", label: "mol/(m³ Pa)", toSI: 1 },
    { id: "M/atm", label: "M/atm (mol/L per atm)", toSI: 1000 / ATM },
  ],
  Hcc: [{ id: "-", label: "dimensionless", toSI: 1 }],
  Hxp: [
    { id: "1/Pa", label: "1/Pa", toSI: 1 },
    { id: "1/atm", label: "1/atm", toSI: 1 / ATM },
  ],
  Hbp: [
    { id: "mol/(kg Pa)", label: "mol/(kg Pa)", toSI: 1 },
    { id: "mol/(kg atm)", label: "mol/(kg atm)", toSI: 1 / ATM },
  ],
  KHpc: [
    { id: "Pa m3/mol", label: "Pa m³/mol", toSI: 1 },
    { id: "atm m3/mol", label: "atm m³/mol", toSI: ATM },
    { id: "bar L/mol", label: "bar L/mol", toSI: 1e5 * 1e-3 },
    { id: "atm L/mol", label: "atm L/mol", toSI: ATM * 1e-3 },
  ],
  KHpx: [
    { id: "Pa", label: "Pa", toSI: 1 },
    { id: "atm", label: "atm", toSI: ATM },
    { id: "bar", label: "bar", toSI: 1e5 },
  ],
  KHcc: [{ id: "-", label: "dimensionless", toSI: 1 }],
};

/** The SI unit each variant is printed in. */
export const HENRY_SI_UNIT: Readonly<Record<HenryForm, string>> = {
  Hcp: "mol/(m³ Pa)", Hcc: "–", Hxp: "1/Pa", Hbp: "mol/(kg Pa)",
  KHpc: "Pa m³/mol", KHpx: "Pa", KHcc: "–",
};

export interface Water { rho: number; M: number }
export const SANDER_WATER: Water = { rho: RHO_W_SANDER, M: M_W_SANDER };

/** Any variant, in SI, to H^cp in mol/(m3 Pa). */
export function toHcp(form: HenryForm, v: number, T: number, w: Water = SANDER_WATER): number {
  switch (form) {
    case "Hcp": return v;
    case "Hcc": return v / (R_GAS * T);          // Eq. 3: H^cc = H^cp R T
    case "Hxp": return v * w.rho / w.M;          // Eq. 6: H^xp = (M_w/ρ_w) H^cp
    case "Hbp": return v * w.rho;                // Eq. 11: H^bp = H^cp/ρ_w
    case "KHpc": return 1 / v;                   // Eq. 14
    case "KHpx": return w.rho / (w.M * v);       // Eq. 15 with Eq. 6
    case "KHcc": return 1 / (v * R_GAS * T);     // Eq. 16 with Eq. 3
  }
}

/** H^cp to every variant, in SI. */
export function fromHcp(Hcp: number, T: number, w: Water = SANDER_WATER): Record<HenryForm, number> {
  const Hcc = Hcp * R_GAS * T, Hxp = Hcp * w.M / w.rho;
  return { Hcp, Hcc, Hxp, Hbp: Hcp / w.rho, KHpc: 1 / Hcp, KHpx: 1 / Hxp, KHcc: 1 / Hcc };
}

/** How each variant follows from H^cp, in words the page prints. */
export const HENRY_HOW: Readonly<Record<HenryForm, string>> = {
  Hcp: "c_a/p (Eq. 1)",
  Hcc: "H^cp R T (Eq. 3)",
  Hxp: "H^cp M_w/ρ_w (Eq. 6, dilute)",
  Hbp: "H^cp/ρ_w (Eq. 11, dilute)",
  KHpc: "1/H^cp (Eq. 14)",
  KHpx: "1/H^xp (Eq. 15)",
  KHcc: "1/H^cc (Eq. 16)",
};

/** The slope of the equilibrium line y = m x at total pressure P: Dalton's
 *  law y = p/P with p = K_H^px x (Sander Eq. 15) -- the K-value of Seader
 *  Eq. 3-194, and what Choupo computes as K = H/P for a Henry solute. */
export const henrySlope = (KHpx: number, P: number): number => KHpx / P;

/** Sander's example gases, Table 6 (the first, review-type `L` row of each),
 *  in his unit mol/(m3 Pa) at 298.15 K. */
export const SANDER_EXAMPLES = [
  { id: "O2", name: "oxygen", Hcp: 1.3e-5, dlnHdinvT: 1500, row: "Sander et al. (2011), type L", page: 4408, M: 31.998 },
  { id: "NH3", name: "ammonia", Hcp: 5.9e-1, dlnHdinvT: 4200, row: "Sander et al. (2011), type L", page: 4410, M: 17.031 },
] as const;

/** Choupo's water record, data/standards/components/water.dat,
 *  `vaporPressure { model Antoine; coefficients (5.40221 1838.675 -31.737); }`,
 *  in the engine's form log10(Psat/bar) = A - B/(T + C) (Antoine.cpp), valid
 *  273-373 K.  Used once: the water vapour of saturated air in exercise 2. */
export const WATER_ANTOINE = { A: 5.40221, B: 1838.675, C: -31.737 } as const;
export const waterVapourPressure = (T: number): number =>
  1e5 * Math.pow(10, WATER_ANTOINE.A - WATER_ANTOINE.B / (T + WATER_ANTOINE.C));

/** Choupo's own O2 record, data/standards/parameters/Henry/O2-water.dat:
 *  `H_ref 4.40e9 Pa;`, read as a pressure (HenrysLaw.cpp) and used as p/x. */
export const CHOUPO_O2_HREF_PA = 4.40e9;

// ---- 3. overall coefficients -------------------------------------------------------

export interface Overall {
  Ky: number; Kx: number;
  gasShare: number; liquidShare: number;
  controlling: "gas" | "liquid" | "both";
}

/** Resistances in series in the mole-fraction form, one slope m for both
 *  chords (Treybal 5.7 and 5.9 with m' = m'' = m; Seader 3-198, 3-199 with
 *  K_A = m); the shares are Treybal 5.10 and 5.11.  "Controlling" is this
 *  page's own label for a film that holds 90 % or more of the resistance. */
export function overallMoleFraction(ky: number, kx: number, m: number): Overall {
  const Ky = 1 / (1 / ky + m / kx);
  const Kx = 1 / (1 / (m * ky) + 1 / kx);
  const gasShare = (1 / ky) * Ky;
  const liquidShare = (m / kx) * Ky;
  const controlling = gasShare >= 0.9 ? "gas" : liquidShare >= 0.9 ? "liquid" : "both";
  return { Ky, Kx, gasShare, liquidShare, controlling };
}

/** The concentration forms with a solubility H^cp = c/p (Seader 3-187,
 *  3-191): 1/K_G = 1/k_p + 1/(H k_L) and 1/K_L = H/k_p + 1/k_L. */
export function overallConcentration(kp: number, kL: number, Hcp: number): { KG: number; KL: number; gasShare: number } {
  const KG = 1 / (1 / kp + 1 / (Hcp * kL));
  const KL = 1 / (Hcp / kp + 1 / kL);
  return { KG, KL, gasShare: KG / kp };
}

// ---- 3b. a curved equilibrium line: Seader et al., Example 3.18 ---------------------

/** SO2 in water at 50 °C and 2 atm, Seader's fit of his tabulated equilibrium
 *  data (his Eq. (1) of Example 3.18, p. 80): y = 29.74 x + 6733 x^2. */
export const SO2 = {
  a: 29.74, b: 6733,
  yb: 0.085, xb: 0.001,
  kx: 0.18 * 55.0,               // kmol/(h m2): k_c c, Seader p. 80
  ky: 0.040 * 2 * 101.3,         // kmol/(h m2): k_p P with Seader's 101.3 kPa
} as const;

export const so2y = (x: number): number => SO2.a * x + SO2.b * x * x;
export const so2slope = (x: number): number => SO2.a + 2 * SO2.b * x;
export const so2x = (y: number): number => (-SO2.a + Math.sqrt(SO2.a * SO2.a + 4 * SO2.b * y)) / (2 * SO2.b);

export interface CurvedDemo {
  ky: number; kx: number;
  xi: number; yi: number; N: number;            // exact (low flux)
  xStar: number; yStar: number;                 // fictitious bulk equilibria
  mChordMD: number; mChordCM: number;           // Treybal's m'' and m'
  KxExact: number; NfromChord: number;          // Treybal 5.9 with m'': exact
  mAverage: number; NAverage: number;           // Seader (a)
  mAtXstar: number; NAtXstar: number;           // Seader (b): slope at x*
  mDilute: number; xStarDilute: number; NDilute: number;   // a straight Henry line
}

/** The interface and every overall-coefficient estimate for Seader's SO2
 *  example, with the gas coefficient multiplied by `kyScale` (1 = his case).
 *  Bulk flow is ignored, as in his parts (a) and (b). */
export function curvedDemo(kyScale = 1): CurvedDemo {
  const ky = SO2.ky * kyScale, kx = SO2.kx, { yb, xb } = SO2;
  const xStar = so2x(yb), yStar = so2y(xb);
  //  The interface: k_y (y_b - f(x_i)) = k_x (x_i - x_b), on [x_b, x*]; the
  //  residual is positive at x_b and negative at x*, so the bracket holds.
  const xi = bisect((x) => ky * (yb - so2y(x)) - kx * (x - xb), xb, xStar);
  const yi = so2y(xi), N = kx * (xi - xb);
  const mChordMD = (yb - yi) / (xStar - xi);           // Treybal m'', chord M-D
  const mChordCM = (yi - yStar) / (xi - xb);           // Treybal m', chord C-M
  const KxExact = 1 / (1 / (mChordMD * ky) + 1 / kx);
  const mAverage = (yb - yStar) / (xStar - xb);
  const mAtXstar = so2slope(xStar);
  const NAverage = (1 / (1 / kx + 1 / (mAverage * ky))) * (xStar - xb);
  const NAtXstar = (1 / (1 / kx + 1 / (mAtXstar * ky))) * (xStar - xb);
  const mDilute = SO2.a, xStarDilute = yb / mDilute;
  const NDilute = (1 / (1 / kx + 1 / (mDilute * ky))) * (xStarDilute - xb);
  return {
    ky, kx, xi, yi, N, xStar, yStar, mChordMD, mChordCM, KxExact,
    NfromChord: KxExact * (xStar - xb), mAverage, NAverage, mAtXstar, NAtXstar,
    mDilute, xStarDilute, NDilute,
  };
}

// ---- 4. reaction in the liquid film ------------------------------------------------

/** Hatta number of a first-order or pseudo-first-order reaction, k1 in 1/s
 *  (Missen 9.2-40; Seader 6-131 with k1 = k c_B). */
export const hatta = (k1: number, DA: number, kL: number): number => Math.sqrt(k1 * DA) / kL;

/** E for a fast (pseudo-)first-order reaction in the film only (Missen 9.2-49).
 *  Below Ha = 1e-6 the series 1 + Ha^2/3 replaces 0/0. */
export function ePseudoFirst(Ha: number): number {
  if (Ha < 1e-6) return 1 + (Ha * Ha) / 3;
  return Ha / Math.tanh(Ha);
}

/** E of an instantaneous reaction (Missen 9.2-53; Seader 6-132 with
 *  c_Ai = p_I/H'). */
export const eInstantaneous = (DB: number, cB: number, DA: number, b: number, cAi: number): number =>
  1 + (DB * cB) / (DA * b * cAi);

/** Van Krevelen and Hoftijzer's implicit approximation for a fast
 *  second-order reaction, E = psi/tanh(psi), psi = Ha ((Ei - E)/(Ei - 1))^(1/2)
 *  (Missen 9.2-51, 9.2-52), solved by bisection on [1, Ei]: the residual
 *  E - psi/tanh(psi) is 1 - Ha/tanh(Ha) <= 0 at E = 1 and Ei - 1 > 0 at E = Ei. */
export function eVanKrevelen(Ha: number, Ei: number): number {
  if (!(Ei > 1)) return 1;
  const g = (E: number): number => {
    const psi = Ha * Math.sqrt(Math.max(0, (Ei - E) / (Ei - 1)));
    return E - ePseudoFirst(psi);
  };
  return bisect(g, 1, Ei);
}

export type Regime = "bulk" | "film" | "both";

/** Missen's criterion (p. 253): Ha above about 3, reaction in the liquid film
 *  only; below about 0.1, in the bulk liquid only. */
export function regimeOf(Ha: number): Regime {
  return Ha < 0.1 ? "bulk" : Ha > 3 ? "film" : "both";
}

export const REGIME_SAYS: Readonly<Record<Regime, string>> = {
  bulk: "reaction in the bulk liquid only (Ha below about 0.1): A crosses the film before it reacts",
  film: "reaction in the liquid film only (Ha above about 3): A is consumed before it reaches the bulk",
  both: "reaction in the film and in the bulk (Ha between about 0.1 and 3): neither limit holds",
};

export interface ReactiveInput {
  k2: number;    // m3/(mol s), second-order rate constant
  cB: number;    // mol/m3, bulk B
  DA: number;    // m2/s
  DB: number;    // m2/s
  kL: number;    // m/s, physical liquid-film coefficient
  b: number;     // mol B per mol A
  HA: number;    // Pa m3/mol, volatility p = H_A c (Missen 9.2-8)
  pA: number;    // Pa, partial pressure at the interface (no gas film)
}

export interface ReactiveResult {
  Ha: number; cAi: number; Ei: number; Epfo: number; Evkh: number;
  ratio: number; regime: Regime;
  Nphys: number; Npfo: number; Nvkh: number;
  /** E = Ha/tanh Ha above the instantaneous limit E_i: the pseudo-first-order
   *  form is not valid there (Missen p. 252: E is bounded by E_i). */
  pfoAboveInstantaneous: boolean;
}

/** Missen Example 9-6's arithmetic for any input: Ha (9.2-54), E_i (9.2-53)
 *  with c_Ai = p_A/H_A (9.2-8, no gas film), E by 9.2-49 and 9.2-51, and the
 *  flux E k_L c_Ai (9.2-26a). */
export function reactive(r: ReactiveInput): ReactiveResult {
  const Ha = hatta(r.k2 * r.cB, r.DA, r.kL);
  const cAi = r.pA / r.HA;
  const Ei = eInstantaneous(r.DB, r.cB, r.DA, r.b, cAi);
  const Epfo = ePseudoFirst(Ha), Evkh = eVanKrevelen(Ha, Ei);
  const Nphys = r.kL * cAi;
  return {
    Ha, cAi, Ei, Epfo, Evkh, ratio: Evkh / Epfo, regime: regimeOf(Ha),
    Nphys, Npfo: Epfo * Nphys, Nvkh: Evkh * Nphys, pfoAboveInstantaneous: Epfo > Ei,
  };
}

export function reactiveRefusal(r: ReactiveInput): string | null {
  for (const [k, v] of Object.entries(r)) if (!(v > 0)) return `${k} must be positive`;
  return null;
}

/** Missen Example 9-6 (pp. 253-255), data "Danckwerts, 1970, p. 118, in part":
 *  pure CO2 at 1 bar into aqueous NaOH at 20 °C, CO2 + 2 NaOH. */
export const MISSEN_9_6: ReactiveInput = {
  k2: 10000 * 1e-3,       // 10,000 L/(mol s) -> m3/(mol s)
  cB: 100,                // 0.1 mol/L (case a); case b is 6 mol/L
  DA: 1.8e-5 * 1e-4,      // cm2/s -> m2/s
  DB: 3.1e-5 * 1e-4,
  kL: 0.04 * 1e-2,        // cm/s -> m/s
  b: 2,
  HA: 36 * 1e5 * 1e-3,    // 36 bar L/mol -> Pa m3/mol
  pA: 1e5,                // 1 bar
};

/** The E-against-Ha curves of the plot: E = Ha/tanh Ha and van Krevelen-
 *  Hoftijzer at several E_i, on a log grid of Ha. */
export function eCurves(Eis: readonly number[], lo = 0.1, hi = 1000, n = 120): {
  Ha: number[]; pfo: number[]; vkh: { Ei: number; E: number[] }[];
} {
  const Ha = Array.from({ length: n }, (_, k) => lo * Math.pow(hi / lo, k / (n - 1)));
  return {
    Ha,
    pfo: Ha.map(ePseudoFirst),
    vkh: Eis.map((Ei) => ({ Ei, E: Ha.map((h) => eVanKrevelen(h, Ei)) })),
  };
}

// ---- 5. exercises ------------------------------------------------------------------

export interface Exercise {
  id: string;
  title: string;
  statement: string;
  data: readonly string[];
  source: string;
  solution: readonly string[];
  answer: string;
  /** The numbers the answer prints, keyed, for the tests. */
  values: Readonly<Record<string, number>>;
}

/** The six exercises, every number computed here from the data they state. */
export function exercises(): Exercise[] {
  // 1. Seader Example 3.18's coefficients
  const kc1 = 0.18, c1 = 55.0, kp1 = 0.040, P1 = 2 * 101.325, T1 = 323.15;
  const kx1 = kc1 * c1, ky1 = kp1 * P1, kcG1 = kp1 * R_GAS * T1, yBLM1 = 1 - 0.085;
  const kys1 = ky1 / yBLM1;
  // 2. oxygen
  const o2 = SANDER_EXAMPLES[0];
  const h2 = fromHcp(o2.Hcp, T_STD);
  const m2 = henrySlope(h2.KHpx, ATM);
  const y2 = 0.21, x2 = y2 / m2, c2 = o2.Hcp * y2 * ATM, mg2 = c2 * o2.M;
  const mgLow2 = 1.2e-5 * y2 * ATM * o2.M;
  const pw2 = waterVapourPressure(T_STD);
  const pHumid2 = y2 * (ATM - pw2), mgHumid2 = o2.Hcp * pHumid2 * o2.M;
  // 3. Seader Example 3.18 (a), with his printed inputs
  const kx3 = 9.9, ky3 = 8.1, m3 = 49.7, xs3 = 0.001975, xb3 = 0.001;
  const o3 = overallMoleFraction(ky3, kx3, m3);
  const N3 = o3.Kx * (xs3 - xb3);
  // 4. ammonia, gas and liquid films
  const nh3 = SANDER_EXAMPLES[1];
  const kp4 = 1.0e-5, kL4 = 1.0e-4, pb4 = 0.01 * ATM;
  const o4 = overallConcentration(kp4, kL4, nh3.Hcp);
  const N4 = o4.KG * pb4, pi4 = pb4 - N4 / kp4, ci4 = nh3.Hcp * pi4;
  // 5 and 6. Missen Example 9-6
  const r5 = reactive({ ...MISSEN_9_6, cB: 100 });
  const r6 = reactive({ ...MISSEN_9_6, cB: 6000 });

  return [
    {
      id: "convert-film",
      title: "Convert two film coefficients",
      statement: "Sulfur dioxide is absorbed into water in a packed column at 50 °C and 2 atm. The coefficients were "
        + "measured as a liquid coefficient per concentration and a gas coefficient per partial pressure. Express both "
        + "per mole fraction, in kmol/(h m²) and in SI, give the gas coefficient per concentration, and correct the gas "
        + "coefficient for diffusion through stagnant air.",
      data: [
        "k_c (liquid) = 0.18 m/h; total liquid concentration c = 55.0 kmol/m³",
        "k_p (gas) = 0.040 kmol/(h m² kPa); P = 2 atm = 202.65 kPa; T = 323.15 K",
        "for the stagnant film, (y_B)_LM ≈ 1 − y_A = 1 − 0.085 = 0.915, as the book takes it",
      ],
      source: "Seader et al. (2016), Example 3.18, pp. 79-80 (its data, and its parts (a) and (c))",
      solution: [
        `k_x = k_c c = 0.18 m/h × 55.0 kmol/m³ = ${sig(kx1, 3)} kmol/(h m²) = ${sig(kx1 / HOUR, 3)} kmol/(m² s)   (Seader 3-200).`,
        `k_y = k_p P = 0.040 kmol/(h m² kPa) × 202.65 kPa = ${sig(ky1, 4)} kmol/(h m²) = ${sig(ky1 / HOUR, 4)} kmol/(m² s)   (Seader 3-201; the book takes 101.3 kPa per atm and prints 8.1).`,
        `k_c (gas) = k_p R T = 0.040 kmol/(h m² kPa) × 8.314 kPa m³/(kmol K) × 323.15 K = ${sig(kcG1, 4)} m/h = ${sig(kcG1 / HOUR, 4)} m/s.`,
        `Stagnant air: k_y^s = k_y/(y_B)_LM = ${sig(ky1, 4)}/0.915 = ${sig(kys1, 4)} kmol/(h m²)   (Seader 3-203; the book, from its rounded 8.1, prints 8.85).`,
      ],
      answer: `k_x = ${sig(kx1, 3)} kmol/(h m²); k_y = ${sig(ky1, 4)} kmol/(h m²); k_c(gas) = ${sig(kcG1 / HOUR, 4)} m/s; k_y^s = ${sig(kys1, 4)} kmol/(h m²).`,
      values: { kx: kx1, kxSI: kx1 / HOUR, ky: ky1, kySI: ky1 / HOUR, kcGas: kcG1 / HOUR, kys: kys1 },
    },
    {
      id: "convert-henry",
      title: "One Henry constant, five ways",
      statement: "Sander's compilation gives oxygen's Henry solubility in water as H^cp = 1.3×10⁻⁵ mol/(m³ Pa) at 298.15 K. "
        + "Give the volatility K_H^px in Pa and in atm, the dimensionless H^cc, the slope m of y = m x at 1 atm, and the "
        + "dissolved oxygen of water under air at 1 atm (y = 0.21) as a mole fraction and in mg/L.",
      data: [
        "H^cp = 1.3×10⁻⁵ mol/(m³ Pa), T = 298.15 K (Sander 2015, Table 6, p. 4408)",
        "ρ_w = 997 kg/m³ and M_w = 18.0153 g/mol (the values behind Sander's Table 1)",
        "y_O2 = 0.21 and P = 101325 Pa: illustrative values of this exercise; M_O2 = 31.998 g/mol",
        "for the precision notes: the vapour pressure of water at 298.15 K from Choupo's water record "
          + "(data/standards/components/water.dat, Antoine coefficients 5.40221, 1838.675, −31.737, P in bar)",
      ],
      source: "Sander (2015), Eqs. 3, 6, 15 and Table 6 (pp. 4401-4403, 4408); the air is the exercise's own",
      solution: [
        `H^xp = H^cp M_w/ρ_w = 1.3×10⁻⁵ × 0.0180153/997 = ${sig(h2.Hxp, 4)} 1/Pa   (Sander Eq. 6; working digits kept to the end).`,
        `K_H^px = 1/H^xp = ${sig(h2.KHpx, 4)} Pa = ${sig(h2.KHpx / ATM, 4)} atm   (Eq. 15).`,
        `H^cc = H^cp R T = 1.3×10⁻⁵ × 8.314 × 298.15 = ${sig(h2.Hcc, 4)}   (Eq. 3); K_H^cc = 1/H^cc = ${sig(h2.KHcc, 4)}.`,
        `m = K_H^px/P = ${sig(h2.KHpx, 4)}/101325 = ${sig(m2, 4)}.`,
        `x = y/m = 0.21/${sig(m2, 4)} = ${sig(x2, 4)}; c = H^cp p = 1.3×10⁻⁵ × 0.21 × 101325 = ${sig(c2, 4)} mol/m³ = ${sig(mg2, 4)} mg/L.`,
        `Precision: the datum has two significant figures, so the answers do too.  Sander's oxygen rows spread from 1.2×10⁻⁵ to 1.3×10⁻⁵ mol/(m³ Pa) (Table 6, p. 4408), which alone moves the dissolved oxygen from ${sig(mgLow2, 2)} to ${sig(mg2, 2)} mg/L.`,
        `Water vapour is neglected: over water at 25 °C the air is saturated, and the vapour pressure of water, ${sig(pw2, 3)} Pa (Choupo's water record, Antoine form), lowers p_O2 to 0.21 × (101325 − ${sig(pw2, 3)}) = ${sig(pHumid2, 4)} Pa, ${sig(100 * pw2 / ATM, 2)} % less: ${sig(mgHumid2, 2)} mg/L instead of ${sig(mg2, 2)}.`,
      ],
      answer: `K_H^px = ${sig(h2.KHpx, 2)} Pa (${sig(h2.KHpx / ATM, 2)} atm); H^cc = ${sig(h2.Hcc, 2)}; m = ${sig(m2, 2)}; x = ${sig(x2, 2)}; ${sig(mg2, 2)} mg/L in dry air (${sig(mgHumid2, 2)} mg/L over saturated air).`,
      values: { Hxp: h2.Hxp, KHpx: h2.KHpx, KHpxAtm: h2.KHpx / ATM, Hcc: h2.Hcc, KHcc: h2.KHcc, m: m2, x: x2, c: c2, mg: mg2,
        mgLow: mgLow2, pw: pw2, mgHumid: mgHumid2 },
    },
    {
      id: "overall",
      title: "The overall coefficient and the controlling film",
      statement: "For the SO₂ absorber of exercise 1, at the point where y = 0.085 and x = 0.001, take the average slope of the "
        + "equilibrium curve over the range, m = 49.7. Compute K_x, the share of the resistance in each film, and the flux.",
      data: [
        "k_x = 9.9 and k_y = 8.1 kmol/(h m²) (exercise 1, as the book rounds them)",
        "m = 49.7; x* = 0.001975 (the liquid in equilibrium with y = 0.085); x_b = 0.001",
      ],
      source: "Seader et al. (2016), Example 3.18 part (a), p. 80; Treybal (1980) Eqs. 5.9-5.11, p. 110",
      solution: [
        `1/K_x = 1/k_x + 1/(m k_y) = 1/9.9 + 1/(49.7 × 8.1) = ${sig(1 / kx3, 4)} + ${sig(1 / (m3 * ky3), 4)} = ${sig(1 / o3.Kx, 4)} h m²/kmol.`,
        `K_x = ${sig(o3.Kx, 4)} kmol/(h m²).`,
        `Liquid share (1/k_x)/(1/K_x) = ${sig(100 * o3.liquidShare, 3)} %; gas share ${sig(100 * o3.gasShare, 3)} %: the liquid film controls.`,
        `N = K_x (x* − x_b) = ${sig(o3.Kx, 4)} × (0.001975 − 0.001) = ${sig(N3, 3)} kmol/(h m²).`,
      ],
      answer: `K_x = ${sig(o3.Kx, 3)} kmol/(h m²); liquid ${sig(100 * o3.liquidShare, 3)} % of the resistance; N = ${sig(N3, 3)} kmol/(h m²).`,
      values: { Kx: o3.Kx, liquidShare: o3.liquidShare, gasShare: o3.gasShare, N: N3 },
    },
    {
      id: "absorption-flux",
      title: "An absorption flux through two films",
      statement: "Ammonia at 1 % in air at 1 atm and 25 °C meets fresh water. With the film coefficients below, find K_G, "
        + "K_L, the flux, the share of the resistance in the gas film, and the interface partial pressure and concentration.",
      data: [
        "H^cp(NH₃) = 0.59 mol/(m³ Pa) at 298.15 K (Sander 2015, Table 6, p. 4410), used as a plain Henry constant: "
          + "ammonia's ionisation in water is not counted",
        "k_p = 1.0×10⁻⁵ mol/(m² s Pa) and k_L = 1.0×10⁻⁴ m/s: illustrative values of this exercise",
        "p_b = 0.01 × 101325 = 1013.25 Pa; c_b = 0",
      ],
      source: "Seader et al. (2016) Eqs. 3-180 to 3-191, pp. 76-77; Sander (2015) Table 6, p. 4410",
      solution: [
        `Gas resistance 1/k_p = ${sig(1 / kp4, 4)} m² s Pa/mol; liquid resistance 1/(H k_L) = 1/(0.59 × 1.0×10⁻⁴) = ${sig(1 / (nh3.Hcp * kL4), 4)} m² s Pa/mol.`,
        `K_G = 1/(${sig(1 / kp4, 4)} + ${sig(1 / (nh3.Hcp * kL4), 4)}) = ${sig(o4.KG, 4)} mol/(m² s Pa)   (Seader 3-191); K_L = K_G/H = ${sig(o4.KL, 4)} m/s   (3-187).`,
        `Gas share K_G/k_p = ${sig(100 * o4.gasShare, 3)} %: a very soluble gas puts most of the resistance in the gas film.`,
        `N = K_G (p_b − c_b/H) = ${sig(o4.KG, 4)} × 1013.25 = ${sig(N4, 4)} mol/(m² s).`,
        `p_i = p_b − N/k_p = ${sig(pi4, 4)} Pa; c_i = H p_i = ${sig(ci4, 4)} mol/m³; check: k_L c_i = ${sig(kL4 * ci4, 4)} mol/(m² s).`,
      ],
      answer: `K_G = ${sig(o4.KG, 3)} mol/(m² s Pa); K_L = ${sig(o4.KL, 3)} m/s; N = ${sig(N4, 3)} mol/(m² s); gas ${sig(100 * o4.gasShare, 3)} %; p_i = ${sig(pi4, 3)} Pa, c_i = ${sig(ci4, 3)} mol/m³.`,
      values: { KG: o4.KG, KL: o4.KL, N: N4, gasShare: o4.gasShare, pi: pi4, ci: ci4 },
    },
    {
      id: "regime",
      title: "Which regime? CO₂ into dilute caustic",
      statement: "Pure CO₂ at 1 bar is absorbed into 0.1 mol/L NaOH at 20 °C; CO₂ + 2 NaOH, second order. Compute Ha and E_i, "
        + "decide where the reaction happens, and compare E from the pseudo-first-order formula with van Krevelen and "
        + "Hoftijzer's approximation. Is the pseudo-first-order assumption safe?",
      data: [
        "k = 10,000 L/(mol s); D_A = 1.8×10⁻⁵ cm²/s; k_L = 0.04 cm/s; D_B = 3.1×10⁻⁵ cm²/s; H_A = 36 bar L/mol; b = 2",
        "c_B = 0.1 mol/L; no gas film (pure gas): c_Ai = p_A/H_A",
      ],
      source: "Missen et al. (1999), Example 9-6 case (a), pp. 253-255 (data from Danckwerts 1970, p. 118, as the book cites)",
      solution: [
        `Ha = (k D_A c_B)^½/k_L = (10 m³/(mol s) × 1.8×10⁻⁹ m²/s × 100 mol/m³)^½ / 4×10⁻⁴ m/s = ${sig(r5.Ha, 3)}   (Missen 9.2-54).`,
        `c_Ai = p_A/H_A = 1 bar/(36 bar L/mol) = ${sig(r5.cAi, 4)} mol/m³; E_i = 1 + D_B c_B/(D_A b c_Ai) = 1 + (3.1/1.8)(100)/(2 × ${sig(r5.cAi, 4)}) = ${sig(r5.Ei, 3)}   (9.2-53).`,
        `Ha = ${sig(r5.Ha, 3)} > 3: the reaction is in the liquid film only (Missen p. 253).`,
        `Pseudo-first-order: E = Ha/tanh Ha = ${sig(r5.Epfo, 3)}   (9.2-49). Van Krevelen-Hoftijzer: E = ψ/tanh ψ, ψ = Ha((E_i − E)/(E_i − 1))^½, solved: E = ${sig(r5.Evkh, 3)}   (9.2-51, 9.2-52).`,
        `The ratio is ${sig(100 * r5.ratio, 3)} % (the book, from its rounded 2.5 and 3.4, prints 74 %).  The pseudo-first-order form assumes c_B the same across the film; B runs short near the interface here, and that form overstates the rate.`,
      ],
      answer: `Ha = ${sig(r5.Ha, 2)}, E_i = ${sig(r5.Ei, 2)}; film reaction; E = ${sig(r5.Evkh, 2)} (van Krevelen-Hoftijzer) against ${sig(r5.Epfo, 2)} (pseudo-first-order): not safe.`,
      values: { Ha: r5.Ha, Ei: r5.Ei, Evkh: r5.Evkh, Epfo: r5.Epfo, ratio: r5.ratio, cAi: r5.cAi },
    },
    {
      id: "reactive-flux",
      title: "The flux with reaction, in strong caustic",
      statement: "Repeat exercise 5 with c_B = 6 mol/L. Compute Ha, E_i and both values of E, decide whether the reaction "
        + "may be treated as pseudo-first-order, and compute the absorption flux of CO₂ with and without the reaction.",
      data: [
        "as in exercise 5, with c_B = 6 mol/L",
      ],
      source: "Missen et al. (1999), Example 9-6 case (b), pp. 253-255; the flux by Missen 9.2-26a",
      solution: [
        `Ha = (10 × 1.8×10⁻⁹ × 6000)^½/4×10⁻⁴ = ${sig(r6.Ha, 3)}; E_i = 1 + (3.1/1.8)(6000)/(2 × ${sig(r6.cAi, 4)}) = ${sig(r6.Ei, 3)}.`,
        `E (pseudo-first-order) = ${sig(r6.Epfo, 3)}; E (van Krevelen-Hoftijzer) = ${sig(r6.Evkh, 3)}; ratio ${sig(100 * r6.ratio, 3)} % (the book prints 94 %, from 24.3 and 26): pseudo-first-order is a fair approximation.`,
        `Without reaction: N = k_L c_Ai = 4×10⁻⁴ m/s × ${sig(r6.cAi, 4)} mol/m³ = ${sig(r6.Nphys, 3)} mol/(m² s).`,
        `With reaction: N = E k_L c_Ai = ${sig(r6.Epfo, 3)} × ${sig(r6.Nphys, 3)} = ${sig(r6.Npfo, 3)} mol/(m² s) (pseudo-first-order), or ${sig(r6.Nvkh, 3)} with the approximate E.`,
      ],
      answer: `Ha = ${sig(r6.Ha, 3)}, E_i = ${sig(r6.Ei, 3)}; E = ${sig(r6.Epfo, 3)} (pseudo-first-order) or ${sig(r6.Evkh, 3)}; N = ${sig(r6.Npfo, 3)} mol/(m² s) against ${sig(r6.Nphys, 3)} without reaction.`,
      values: { Ha: r6.Ha, Ei: r6.Ei, Epfo: r6.Epfo, Evkh: r6.Evkh, ratio: r6.ratio, Nphys: r6.Nphys, Npfo: r6.Npfo, Nvkh: r6.Nvkh },
    },
  ];
}
