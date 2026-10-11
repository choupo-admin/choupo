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
  overpressure -- the WITNESSES, the OVERRIDES and the SIZING ARITHMETIC
  behind "Designing for overpressure" (DEV.md 4c C61), kept React-free so
  tests/overpressure.test.ts can hold every number the page prints to the
  tree and to the published worked examples.

  WHAT IS THE ENGINE'S AND WHAT IS THIS FILE'S.  Every property of a FLUID is
  the engine's: Z, k = Cp/Cv, the boiling temperature at the relieving
  pressure and the latent heat there come from two propertyPoint witnesses
  run in the browser (relief01, relief02), and the molar masses are read from
  the component records those witnesses carry.  What this file computes is
  the relief-sizing ARITHMETIC on those numbers -- the published equations of
  API STD 520 Part I and API STD 521 -- which is a calculation procedure, not
  a property, and which the engine does not have (DEV.md 4c C61: no relief
  model exists in src/, and adding one is architecture, not this slice).  The
  precedent is bodeMath.ts / batchMembraneMath.ts: a lesson's own arithmetic,
  with its own tests.

  WHERE EACH CONSTANT WAS READ, and what could not be read.
    * The gas (critical and subcritical) and liquid equations, with their
      constants 0.03948, 17.9 and 11.78 and the preliminary discharge
      coefficients, are API STD 520 Part I's as the open-source `fluids`
      library implements them (C. Bell, fluids/safety_valve.py, MIT licence),
      which reproduces the standard's own worked Examples 1, 2 and 5; the
      test reproduces the same three numbers.  The standard itself was NOT
      read.  The three constants are also DERIVED here from the ideal-gas
      nozzle and the incompressible orifice (derivedCriticalConstant & co.),
      so they are checked twice, by two routes that share nothing.
    * The fire heat input Q = C F A^0.82, with C = 21 000 or 34 500 in
      Btu/h and ft^2, is API STD 521 6th ed. (2014) section 4.4.13.2.4.2 as
      the DIERS Users Group project document "Fire Exposure of Low Volatility
      Liquids" (Rev. 9, 2018) quotes it; the standard itself was NOT read.
      The SI form is converted HERE, exactly, from the US-customary one, and
      the test holds it to the Design Guide's "43.2".
    * The accumulation allowances (10 % or 3 psi, 16 % or 4 psi, 21 % fire)
      and the set-pressure limits are ASME BPVC Section VIII Div. 1
      UG-125(c) and UG-134 (numbering before the 2021 edition) as a
      secondary source quotes them; the Code itself was NOT read.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../../adapters/SolverAdapter.js";
import type { DictOverride } from "../../case/methodRun.js";

// ---- The witnesses ----------------------------------------------------------

export const RELIEF_WITNESS_LOOP = "props/safety/relief01_ammonia_loop_gas";
export const RELIEF_WITNESS_FIRE = "props/safety/relief02_acetone_fire_case";
const PROPS = "system/propsDict";

/** The loop witness's two operations, one per pressure of the C57 loop. */
export const LOOP_OPS = ["loop150", "loop50"] as const;
export type LoopOp = typeof LOOP_OPS[number];

/** The plants each loop operation copies its gas from (held by the test). */
export const LOOP_PLANT: Readonly<Record<LoopOp, string>> = {
  loop150: "plant/greenAmmoniaFeasibility",
  loop50: "plant/greenAmmoniaFeasibility50bar",
};

/** The OPERATING state of each loop's converter feed, as the plant's
 *  converged `PreheatedFeed` prints it.  A COPY, held to that file by the
 *  test: the page needs the operating pressure to place the pressure ladder
 *  before any run has finished. */
export const LOOP_OPERATING: Readonly<Record<LoopOp, { P_Pa: number; T_K: number }>> = {
  loop150: { P_Pa: 15092690.16, T_K: 653.15 },
  loop50: { P_Pa: 5000112.794, T_K: 593.15 },
};

/** The fire witness's operation and its one component. */
export const FIRE_OP = "relieving";
export const FIRE_COMPONENT = "acetone";

/** The temperature the fire witness ships with [K]: its own boiling
 *  temperature at the default relieving pressure, which the test holds to
 *  the witness's T_bubble golden.  The page starts from it. */
export const FIRE_SHIPPED_T_K = 394.109436;

/** The Design Guide's relief chapter, as its \label names it. */
export const DESIGN_GUIDE_RELIEF = "pressure-relief-flare--safety-basics";

/** The MAWP the fire witness ships with [barg] -- a round number chosen for
 *  the lesson and said to be one in the witness's own header. */
export const FIRE_DEFAULT_MAWP_BARG = 5;

// ---- Units ------------------------------------------------------------------

/** Standard atmosphere [Pa]: gauge + this = absolute. */
export const P_ATM_PA = 101325;
/** 1 psi [Pa] (pound-force per square inch, exact from 0.45359237 kg and
 *  0.0254 m with g_n = 9.80665 m/s2). */
export const PSI_PA = 0.45359237 * 9.80665 / (0.0254 * 0.0254);
/** The molar gas constant [J/(mol K)], exact since the 2019 SI. */
export const R_GAS = 8.314462618;
/** 1 Btu/h [W], on the International Table Btu (1055.05585262 J). */
export const BTU_PER_H_W = 1055.05585262 / 3600;
/** ft^2 per m^2 (1 ft = 0.3048 m exactly). */
export const FT2_PER_M2 = 1 / (0.3048 * 0.3048);
/** The water density API 520's specific gravity is referred to, as the
 *  open `fluids` implementation takes it to reproduce Example 5 [kg/m3]. */
export const WATER_REF_DENSITY = 999.0107539518483;

// ---- The pressure ladder ----------------------------------------------------

/** WHICH allowance applies: one device, several devices, or the fire case. */
export type DeviceCase = "single" | "multiple" | "fire";

/** The allowed accumulation above the MAWP while the device relieves, as a
 *  fraction and as a floor in psi -- whichever gives the larger pressure.
 *  ASME VIII-1 UG-125(c) as quoted by a secondary source (the Code was not
 *  read); the fire allowance is quoted there with no psi floor and is coded
 *  with none. */
export const ACCUMULATION: Readonly<Record<DeviceCase, { frac: number; minPsi: number }>> = {
  single: { frac: 0.10, minPsi: 3 },
  multiple: { frac: 0.16, minPsi: 4 },
  fire: { frac: 0.21, minPsi: 0 },
};

/** How high a SET pressure may go, as a multiple of the MAWP: UG-134 as the
 *  same secondary source quotes it.  `first` is the one device every
 *  installation has; `additional` the others of a multiple installation;
 *  `fireSupplemental` a device added for fire only. */
export const SET_LIMITS = { first: 1.00, additional: 1.05, fireSupplemental: 1.10 } as const;

/** The highest gauge pressure the vessel may see while relieving [Pa g]. */
export function maxAccumulatedGauge(mawpG: number, c: DeviceCase): number {
  const a = ACCUMULATION[c];
  return Math.max(mawpG * (1 + a.frac), mawpG + a.minPsi * PSI_PA);
}

/** The relieving pressure P1 the sizing equations take [Pa abs], for a device
 *  set at the MAWP: the accumulated gauge pressure plus the atmosphere. */
export function relievingPressureAbs(mawpG: number, c: DeviceCase): number {
  return maxAccumulatedGauge(mawpG, c) + P_ATM_PA;
}

/** The Design Guide's rule of thumb for the design pressure (= MAWP = set),
 *  from the operating gauge pressure [Pa g]: max(1.1 x op, op + 1.7 bar).
 *  docs/designGuide.tex, "Pressure relief, flare & safety basics". */
export function designPressureGauge(opG: number): number {
  return Math.max(1.1 * opG, opG + 1.7e5);
}

/** The default relieving pressure of each loop, the one the witness ships. */
export function loopRelievingPressure(op: LoopOp): number {
  const opG = LOOP_OPERATING[op].P_Pa - P_ATM_PA;
  return relievingPressureAbs(designPressureGauge(opG), "single");
}

// ---- Gas or vapour (API STD 520 Part I) ------------------------------------
//
//  SI form: A [mm2], W [kg/h], P [kPa abs], T [K], M [kg/kmol].

/** API 520's constant, as the standard prints it (via `fluids`). */
export const API520_C0 = 0.03948;
export const API520_SUBCRITICAL = 17.9;
export const API520_LIQUID = 11.78;

/** The same three constants DERIVED, so the reader (and the test) can see
 *  they are unit bookkeeping and not data.  Critical: the isentropic
 *  ideal-gas nozzle G* = P sqrt(k M/(Z R T) (2/(k+1))^((k+1)/(k-1))) put
 *  into kg/h, kPa, mm2 and g/mol. */
export function derivedCriticalConstant(): number {
  return 3.6 / Math.sqrt(1000 * R_GAS);
}
/** Subcritical: G = F2 sqrt(2 rho1 (P1 - P2)) with rho1 = P1 M/(Z R T). */
export function derivedSubcriticalConstant(): number {
  return (1e6 / 3600) * Math.sqrt(R_GAS / 2000);
}
/** Liquid: Q rho = Kd A sqrt(2 rho dP), Q in L/min, rho = G rho_w, dP kPa. */
export function derivedLiquidConstant(rhoW = WATER_REF_DENSITY): number {
  return (1e6 / 60000) * Math.sqrt(rhoW / 2000);
}

/** The critical-flow coefficient C(k) of API 520 (k = 1 is the limit). */
export function criticalCoefficient(k: number): number {
  if (Math.abs(k - 1) < 1e-9) return API520_C0 * Math.sqrt(1 / Math.E);
  return API520_C0 * Math.sqrt(k * (2 / (k + 1)) ** ((k + 1) / (k - 1)));
}

/** The critical pressure ratio P_cf/P1 = (2/(k+1))^(k/(k-1)). */
export function criticalPressureRatio(k: number): number {
  if (Math.abs(k - 1) < 1e-9) return Math.exp(-0.5);
  return (2 / (k + 1)) ** (k / (k - 1));
}

/** The subcritical coefficient F2(k, r), r = P2/P1. */
export function subcriticalCoefficient(k: number, r: number): number {
  return Math.sqrt((k / (k - 1)) * r ** (2 / k) * ((1 - r ** ((k - 1) / k)) / (1 - r)));
}

export interface GasInput {
  W_kg_h: number; T_K: number; Z: number; M: number; k: number;
  P1_kPa: number; P2_kPa: number;
  Kd: number; Kb: number; Kc: number;
}

export interface GasSizing {
  regime: "critical" | "subcritical";
  A_mm2: number;
  /** The critical pressure ratio and the actual one. */
  rc: number;
  r: number;
  /** C(k) in the critical regime, F2 in the subcritical one. */
  coefficient: number;
}

export function gasArea(g: GasInput): GasSizing {
  const rc = criticalPressureRatio(g.k);
  const r = g.P2_kPa / g.P1_kPa;
  if (r <= rc) {
    const C = criticalCoefficient(g.k);
    return {
      regime: "critical", rc, r, coefficient: C,
      A_mm2: g.W_kg_h / (C * g.Kd * g.P1_kPa * g.Kb * g.Kc)
        * Math.sqrt(g.T_K * g.Z / g.M),
    };
  }
  const F2 = subcriticalCoefficient(g.k, r);
  return {
    regime: "subcritical", rc, r, coefficient: F2,
    A_mm2: API520_SUBCRITICAL * g.W_kg_h / (F2 * g.Kd * g.Kc)
      * Math.sqrt(g.T_K * g.Z / (g.M * g.P1_kPa * (g.P1_kPa - g.P2_kPa))),
  };
}

// ---- Liquid (API STD 520 Part I) -------------------------------------------

export interface LiquidInput {
  Q_L_min: number; G: number;
  /** Upstream relieving and total back pressure, gauge [kPa g]. */
  P1_kPag: number; P2_kPag: number;
  Kd: number; Kw: number; Kc: number; Kv: number;
}

export function liquidArea(l: LiquidInput): number {
  return API520_LIQUID * l.Q_L_min / (l.Kd * l.Kw * l.Kc * l.Kv)
    * Math.sqrt(l.G / (l.P1_kPag - l.P2_kPag));
}

/** Specific gravity from a liquid molar volume and a molar mass. */
export function specificGravity(M_kg_kmol: number, v_m3_mol: number): number {
  return (M_kg_kmol / 1000) / v_m3_mol / WATER_REF_DENSITY;
}

// ---- The fire case (API STD 521) -------------------------------------------

/** The coefficient of Q = C F A^0.82 as published, Btu/h with A in ft^2. */
export const FIRE_C_USC = { adequate: 21000, inadequate: 34500 } as const;
export const FIRE_EXPONENT = 0.82;

/** The same coefficient in W with A in m^2, converted exactly. */
export function fireCoefficientSI(adequate: boolean): number {
  const c = adequate ? FIRE_C_USC.adequate : FIRE_C_USC.inadequate;
  return c * BTU_PER_H_W * FT2_PER_M2 ** FIRE_EXPONENT;
}

/** Heat absorbed by the wetted surface [W]. */
export function fireHeatInput(A_wet_m2: number, F: number, adequate: boolean): number {
  return fireCoefficientSI(adequate) * F * A_wet_m2 ** FIRE_EXPONENT;
}

/** The vapour the fire makes [kg/s]: Q over the latent heat [J/kg]. */
export function fireVapourRate(Q_W: number, lambda_J_kg: number): number {
  return Q_W / lambda_J_kg;
}

// ---- Two-phase and thermal expansion: first principles ----------------------

/** The mass a vent must pass to remove Q [W] when what leaves carries a mass
 *  fraction x of vapour: only the vapour carries the latent heat. */
export function ventMassFlow(Q_W: number, lambda_J_kg: number, x: number): number {
  return Q_W / (x * lambda_J_kg);
}

/** Blocked-in liquid heated at Phi [W]: the volume it must expel [m3/s],
 *  dV/dt = beta Phi / (rho c), from dV = beta V dT and Phi = rho V c dT/dt. */
export function thermalExpansionRate(beta_1_K: number, Phi_W: number,
  rho: number, c_J_kgK: number): number {
  return beta_1_K * Phi_W / (rho * c_J_kgK);
}

// ---- Reading the witnesses --------------------------------------------------

/** `MW` of each component record a witness carries [kg/kmol]. */
export function recordMolarMasses(
  raw: { [rel: string]: string } | undefined,
): { [comp: string]: number } {
  const out: { [comp: string]: number } = {};
  if (!raw) return out;
  for (const [rel, body] of Object.entries(raw)) {
    const m = /^constant\/components\/([A-Za-z0-9_]+)\.dat$/.exec(rel);
    if (!m) continue;
    const mw = /^MW\s+([0-9.eE+-]+)\s*;/m.exec(body);
    if (mw) out[m[1]!] = Number(mw[1]);
  }
  return out;
}

/** One top-level scalar of one component record a witness carries (`Vliq`,
 *  `MW`, ...), or undefined when the record or the key is absent. */
export function recordScalar(
  raw: { [rel: string]: string } | undefined, comp: string, key: string,
): number | undefined {
  const body = raw?.[`constant/components/${comp}.dat`];
  if (!body) return undefined;
  const m = new RegExp(`^${key}\\s+([0-9.eE+-]+)\\s*;`, "m").exec(body);
  return m ? Number(m[1]) : undefined;
}

/** The `composition { ... }` block of the named operation in a propsDict.
 *  Refuses (throws) when the operation or its block is not there: a page
 *  reading a relieving rate off the wrong block would answer the wrong
 *  question. */
export function opComposition(propsDict: string, op: string): { [comp: string]: number } {
  const at = propsDict.search(new RegExp(`\\bname\\s+${op}\\s*;`));
  if (at < 0) throw new Error(`propsDict has no operation '${op}'`);
  const rest = propsDict.slice(at);
  const m = /composition\s*\{([^}]*)\}/.exec(rest);
  if (!m) throw new Error(`operation '${op}' declares no composition`);
  const out: { [comp: string]: number } = {};
  for (const e of m[1]!.matchAll(/([A-Za-z0-9_]+)\s+([-+0-9.eE]+)\s*;/g))
    out[e[1]!] = Number(e[2]);
  return out;
}

export interface LoopGas {
  /** Molar flow [kmol/h] and mass flow [kg/h] of the converter feed. */
  F_kmol_h: number;
  W_kg_h: number;
  /** Mean molar mass [kg/kmol]. */
  M: number;
}

/** The converter feed of one loop, as the witness copies it, priced with the
 *  witness's own record molar masses. */
export function loopGas(raw: { [rel: string]: string } | undefined, op: LoopOp): LoopGas | null {
  const dict = raw?.[PROPS];
  if (!dict) return null;
  const flows = opComposition(dict, op);
  const mw = recordMolarMasses(raw);
  let F = 0, W = 0;
  for (const [c, f] of Object.entries(flows)) {
    const M = mw[c];
    if (M === undefined) throw new Error(`no MW in the record of '${c}'`);
    F += f; W += f * M;
  }
  return { F_kmol_h: F, W_kg_h: W, M: W / F };
}

export interface PointReading {
  T: number; P: number; Z: number; k: number;
  T_bubble?: number; Hvap?: number;
}

/** One propertyPoint operation's numbers, or null when the run has not
 *  published them. */
export function readPoint(r: RunResult | null | undefined, op: string,
  hvapKey?: string): PointReading | null {
  const d = r?.operationResults?.find((o) => o.name === op)?.diagnostics;
  if (!d) return null;
  const num = (k: string): number | undefined =>
    typeof d[k] === "number" && Number.isFinite(d[k]) ? d[k] : undefined;
  const T = num("T"), P = num("P"), Z = num("Z"), k = num("gamma");
  if (T === undefined || P === undefined || Z === undefined || k === undefined)
    return null;
  return { T, P, Z, k, T_bubble: num("T_bubble"),
    Hvap: hvapKey ? num(hvapKey) : undefined };
}

// ---- The overrides ------------------------------------------------------------

/** The loop witness's two relieving pressures, in operation order (the
 *  propsDict declares loop150 first, so `P` occurrence 1 is loop150's). */
export function loopOverrides(P1_150_Pa: number, P1_50_Pa: number): DictOverride[] {
  return [
    { file: PROPS, key: "P", value: P1_150_Pa, unit: "Pa", occurrence: 1 },
    { file: PROPS, key: "P", value: P1_50_Pa, unit: "Pa", occurrence: 2 },
  ];
}

/** The fire witness at a relieving pressure, evaluated at temperature T.  The
 *  page runs it twice: once to read the boiling temperature at P1, then at
 *  that temperature so Z, k and the latent heat belong to the relieving
 *  state. */
export function fireOverrides(P1_Pa: number, T_K: number): DictOverride[] {
  return [
    { file: PROPS, key: "P", value: P1_Pa, unit: "Pa" },
    { file: PROPS, key: "T", value: T_K, unit: "K" },
  ];
}
