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
  compression.ts -- the arithmetic of the "Compressing a gas" page (DEV.md 4c
  C442), as pure functions, so a test can hold every number the page prints to
  the engine's own run.

  WHAT IS THE ENGINE'S AND WHAT IS THE PAGE'S.  The engine's staged design
  (src/postProcessing/sizing/CompressorDesign.cpp, DEV.md 4c C440) writes a
  specification sheet, `design/<unit>/compressor`, with one block of numbers
  per stage: the pressure ratio, the polytropic exponent n, the mean
  compressibility Z, the head, the power.  `readCompressionSheet` reads those
  numbers and nothing else.  The page then does ONE thing with them: the
  closed forms of Brown (2005), the same ones the engine evaluates, run again
  by short functions below, so a student can recompute any number on the
  page.  The test (tests/compression.test.ts) asserts the page's recomputation
  of stage 1 equals the engine's printed stage 1 to the digits the sheet
  prints; that is the anchor the interactive part must reproduce.

  WHAT THE PAGE ASSUMES THAT THE ENGINE DOES NOT.  When the student moves the
  number of stages or the intercooler temperature, the page keeps the
  exponent n of the engine's stage 1 for every stage and every number of
  stages.  The engine re-prices the isentropic path of every stage from the
  package (the air's heat capacity rises with temperature, so the exponent
  differs a little between a cool and a hot stage).  At the engine's own
  choice (three stages, cooled to the suction temperature) the stages are
  identical and the page reproduces the engine's total; away from it the page
  is a constant-exponent estimate, and says so.
\*---------------------------------------------------------------------------*/

import { findDesignSheet } from "../../case/designSheet.js";

/** The witnesses the page runs in the browser. */
export const COMPRESSION_WITNESS = "steady/rotating/compressor03_staged_design";
export const COMPRESSION_UNIT = "compressor1";
export const COMPRESSION_REAL_WITNESS = "plant/ammonia02_full_plant";
export const COMPRESSION_REAL_UNIT = "makeupComp";

/** J/(kmol K), the engine's value: src/postProcessing/sizing/CompressorDesign.cpp:34. */
export const R_KMOL = 8314.462618;

/** The intercooler pressure drop of Brown 2005 p.200: 2 % of the absolute
 *  pressure at the cooler's entrance, never less than 2 psi. */
export const COOLER_DROP_FRACTION = 0.02;
export const COOLER_DROP_MIN_PA = 2 * 6894.757293168;

export interface StageRead {
  ratio: number;
  Tin: number; Pin: number;     // K, Pa
  Tout: number; Pout: number;   // K, Pa
  Zavg: number;
  n: number;
  etaPoly: number;
  head: number;                 // J/kg
  power: number;                // kW, shaft
}

export interface CompressionSheet {
  unit: string;
  MW: number;                   // kg/kmol
  mdot: number;                 // kg/s
  Pin: number; Pout: number;    // Pa
  Tin: number;                  // K
  /** The unit's own single adiabatic pass, as the flowsheet solved it. */
  singlePassTout: number;       // K
  singlePassPower: number;      // kW
  nStages: number;
  rStage: number;
  TdischargeMax: number;        // K, the hottest stage
  TdischargeLimit: number;      // K
  powerGas: number; powerShaft: number;   // kW
  /** Shaft over gas power, minus one: the mechanical loss the sheet applied. */
  mechLoss: number;
  Qintercoolers: number;        // kW (0 for one section)
  stages: StageRead[];
}

/** The numbers of one compressor's sheet, or the reason there are none.
 *  Nothing is defaulted: a key the sheet does not carry refuses by name. */
export function readCompressionSheet(
  designFiles: { [rel: string]: string } | undefined, unit: string,
): CompressionSheet | { error: string } {
  const sheet = findDesignSheet(designFiles, unit, "compressor");
  if (!sheet) return { error: `no compressor sheet for unit '${unit}' in the run's design/ files` };
  const v = new Map(sheet.sizing.map((s) => [s.key, s.value]));
  const need = (k: string): number => {
    const x = v.get(k);
    if (x === undefined) throw new Error(`sheet of '${unit}' has no '${k}'`);
    return x;
  };
  try {
    const nStages = need("nStages");
    const stages: StageRead[] = [];
    for (let i = 1; i <= nStages; ++i) {
      const p = `stage${i}_`;
      stages.push({
        ratio: need(p + "ratio"), Tin: need(p + "Tin"), Pin: need(p + "Pin") * 1e5,
        Tout: need(p + "Tout"), Pout: need(p + "Pout") * 1e5, Zavg: need(p + "Zavg"),
        n: need(p + "n"), etaPoly: need(p + "etaPoly"), head: need(p + "head"),
        power: need(p + "power"),
      });
    }
    const inlet = sheet.inlets[0], outlet = sheet.outlets[0];
    if (!inlet || inlet.mdot === undefined || inlet.T === undefined || inlet.P === undefined
      || !outlet || outlet.T === undefined)
      throw new Error(`sheet of '${unit}' has no complete port 0`);
    const powerGas = need("powerGas"), powerShaft = need("powerShaft");
    return {
      unit, MW: need("MW"), mdot: inlet.mdot, Pin: inlet.P, Pout: need("P_out"),
      Tin: inlet.T, singlePassTout: outlet.T, singlePassPower: need("powerUnitSinglePass"),
      nStages, rStage: need("rStage"), TdischargeMax: need("T_dischargeMax"),
      TdischargeLimit: need("T_dischargeLimit"), powerGas, powerShaft,
      mechLoss: powerShaft / powerGas - 1,
      Qintercoolers: v.get("Q_intercoolers") ?? 0, stages,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- One stage: Brown 2005 Eq 2.71, 5.16, 2.73, 2.78 ------------------------

export interface StageInput {
  T1: number;      // K
  r: number;       // pressure ratio of this stage
  n: number;       // polytropic exponent of the gas on this path
  Z: number;       // mean compressibility
  MW: number;      // kg/kmol
  mdot: number;    // kg/s
  etaP: number;    // polytropic efficiency
  mech: number;    // mechanical loss, a fraction of the gas power
}
export interface StageOut {
  m: number;       // (n-1)/n
  T2: number;      // K
  head: number;    // J/kg
  Wgas: number;    // W
  Wshaft: number;  // W
}

/** The path exponent a = (k-1)/k of the isentropic line, from the sheet's n (Eq 2.71). */
export const aFromN = (n: number, etaP: number): number => etaP * (1 - 1 / n);

export function stage(s: StageInput): StageOut {
  const m = (s.n - 1) / s.n;
  const T2 = s.T1 * Math.pow(s.r, m);                                  // Eq 5.16
  const Rs = R_KMOL / s.MW;
  const head = s.Z * Rs * s.T1 * (1 / m) * (Math.pow(s.r, m) - 1);    // Eq 2.73
  const Wgas = s.mdot * head / s.etaP;                                  // Eq 2.78
  return { m, T2, head, Wgas, Wshaft: Wgas * (1 + s.mech) };
}

/** Isentropic efficiency of a stage whose polytropic efficiency is etaP:
 *  eta_a = (r^a - 1) / (r^(a/eta_p) - 1)  (Eq 2.66 against Eq 2.73 / eta_p). */
export function isentropicEfficiency(r: number, a: number, etaP: number): number {
  return (Math.pow(r, a) - 1) / (Math.pow(r, a / etaP) - 1);
}

/** The polytropic efficiency that makes `isentropicEfficiency` equal etaA
 *  (monotone, bisection, as the engine's polytropicFromAdiabatic). */
export function polytropicEfficiency(r: number, a: number, etaA: number): number {
  let lo = 0.05, hi = 1.0;
  const num = Math.pow(r, a) - 1;
  for (let it = 0; it < 200; ++it) {
    const mid = 0.5 * (lo + hi);
    const f = num / (Math.pow(r, a / mid) - 1);
    if (f < etaA) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** The largest pressure ratio one stage may have before its discharge passes
 *  `Tlimit`, from T2 = T1 r^m (Eq 5.16). */
export const maxStageRatio = (T1: number, Tlimit: number, m: number): number =>
  Math.pow(Tlimit / T1, 1 / m);

// ---- Staging with intercooling --------------------------------------------

/** The equal stage ratio r_s that carries P1 to P2 in N sections when each
 *  intercooler drops max(2 % of its entrance pressure, 2 psi): the balanced
 *  division of Brown Eq 3.17 with the allowance of p.200, solved by bisection
 *  exactly as src/postProcessing/sizing/CompressorDesign.cpp does. */
export function equalStageRatio(
  P1: number, P2: number, N: number,
  dropFrac = COOLER_DROP_FRACTION, dropMin = COOLER_DROP_MIN_PA,
): number {
  const finalP = (rs: number): number => {
    let P = P1;
    for (let i = 0; i < N; ++i) {
      P *= rs;
      if (i + 1 < N) P -= Math.max(dropFrac * P, dropMin);
    }
    return P;
  };
  let lo = 1.0001, hi = (P2 / P1) * 1.5 + 1.0;
  for (let it = 0; it < 200; ++it) {
    const mid = 0.5 * (lo + hi);
    if (finalP(mid) < P2) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface StagedInput {
  N: number;
  Tcool: number;      // K, the intercooler outlet
  T1: number; P1: number; P2: number;
  n: number;          // the exponent of stage 1, held for every stage
  Z: number; MW: number; mdot: number; etaP: number; mech: number;
}
export interface StagedStage {
  r: number; Tin: number; Tout: number; Pin: number; Pout: number;
  Wshaft: number; head: number;
}
export interface StagedOut {
  rStage: number; stages: StagedStage[];
  Wshaft: number;     // W, the sum
  Tmax: number;       // K, the hottest discharge
}

export function staged(p: StagedInput): StagedOut {
  const rs = p.N === 1 ? p.P2 / p.P1 : equalStageRatio(p.P1, p.P2, p.N);
  const out: StagedStage[] = [];
  let T = p.T1, P = p.P1, W = 0, Tmax = 0;
  for (let i = 0; i < p.N; ++i) {
    const Pe = i + 1 === p.N ? p.P2 : P * rs;
    const r = Pe / P;
    const s = stage({ T1: T, r, n: p.n, Z: p.Z, MW: p.MW, mdot: p.mdot, etaP: p.etaP, mech: p.mech });
    out.push({ r, Tin: T, Tout: s.T2, Pin: P, Pout: Pe, Wshaft: s.Wshaft, head: s.head });
    W += s.Wshaft; Tmax = Math.max(Tmax, s.T2);
    if (i + 1 < p.N) {
      T = p.Tcool;
      P = Pe - Math.max(COOLER_DROP_FRACTION * Pe, COOLER_DROP_MIN_PA);
    }
  }
  return { rStage: rs, stages: out, Wshaft: W, Tmax };
}

/** The fewest sections (1..maxN) whose hottest discharge is within the limit,
 *  or null when none is. */
export function fewestStages(p: Omit<StagedInput, "N">, Tlimit: number, maxN = 8): number | null {
  for (let N = 1; N <= maxN; ++N) if (staged({ ...p, N }).Tmax <= Tlimit) return N;
  return null;
}

/** The ideal result of the derivation: N equal ratios of an overall R need
 *  c N (R^(m/N) - 1), with c = mdot (1+mech) Z R_s T1 / (m eta_p), no cooler
 *  drop and every stage cooled back to T1.  The unit of the result is c's. */
export const idealWorkFactor = (R: number, m: number, N: number): number =>
  N * (Math.pow(R, m / N) - 1);

/** The work of an unequal two-stage split r1 * r2 = R, in the same units. */
export const twoStageWorkFactor = (R: number, m: number, r1: number): number =>
  (Math.pow(r1, m) - 1) + (Math.pow(R / r1, m) - 1);
