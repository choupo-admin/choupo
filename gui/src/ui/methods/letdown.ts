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
  letdown -- the WITNESSES, the OVERRIDES and the VALVE ARITHMETIC behind
  "Large pressure letdown" (DEV.md 4c C64), kept React-free so
  tests/letdown.test.ts can hold every number the page prints to the tree.

  WHAT IS THE ENGINE'S AND WHAT IS THIS FILE'S.  Every property of a FLUID
  is the engine's: the outlet temperature, vapour fraction, densities and
  volumetric flows of each throttle come from the `valve` units of
  letdown01 (src/unitOperations/valve/Valve.cpp), run in the browser; the
  ratio of specific heats of the purge gas and the vapour pressure of the
  ammonia come from the propertyPoint witness letdown02; the critical
  pressure of ammonia is read from the record that witness carries.  What
  this file computes is the VALVE ARITHMETIC on those numbers -- the
  pressure-recovery relation, the choked-flow conditions, a staged split of
  the drop, an ideal turbine's work -- which is a calculation procedure,
  not a property.  The engine has no valve sizing (DEV.md 4c C64: "the
  engine-side valve sizer is a later item").

  WHERE EACH RELATION WAS READ, and what could not be read.
    * The liquid and gas choked-flow conditions, the critical pressure
      ratio factor F_F, the specific heat ratio factor F_gamma = k/1.4, the
      expansion factor Y and the vena-contracta pressure written with F_L,
      are IEC 60534-2-1 (ISA-75.01.01-2007) as the open-source `fluids`
      library implements them (C. Bell, fluids/control_valve.py, MIT
      licence, version 1.0.27, read in full: cavitation_index,
      FF_critical_pressure_ratio_l, control_valve_choke_P_l,
      is_choked_turbulent_l, is_choked_turbulent_g, size_control_valve_g,
      control_valve_noise_g_2011).  The standards themselves were NOT read.
      IEC 60534 is copyrighted: the relations are stated as facts with the
      citation, and no table of valve-style factors is transcribed -- F_L
      and x_T are READER-DECLARED assumptions here, with the defaults the
      fluids functions carry as their own keyword defaults (F_L = 0.9,
      x_T = 0.7), labelled as such on the page.
    * The cavitation index sigma = (P1 - Pv)/(P1 - P2) is ISA RP75.23 as
      the same library's docstring cites it; RP75.23 was NOT read.
    * The ideal nozzle's critical pressure ratio is the overpressure page's
      own (criticalPressureRatio, overpressure.ts), derived there.
    * The equal-ratio staging is THIS PAGE'S MODEL of a staged trim, chosen
      for the lesson and said to be one: a maker distributes the drop over
      its stages in its own way.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../../adapters/SolverAdapter.js";
import type { DictOverride } from "../../case/methodRun.js";
import { criticalPressureRatio } from "./overpressure.js";

// ---- The witnesses ----------------------------------------------------------

export const LETDOWN_WITNESS = "steady/hydraulics/letdown01_ammonia_flashing";
export const LETDOWN_PROPS = "props/hydraulics/letdown02_valve_fluid_properties";
/** The plant the witness copies its two inlets from. */
export const LETDOWN_PLANT = "plant/greenAmmonia03_basicDesign";

const FLOWSHEET = "system/flowsheetDict";

/** The three throttles of letdown01, in the order the flowsheet declares
 *  them (which is the order of their `P` lines -- held by the test). */
export const VALVES = ["ValveHP", "ValveLP", "PurgeValve"] as const;
export type ValveName = typeof VALVES[number];

/** The two propertyPoint operations of letdown02. */
export const PROPS_GAS_OP = "purge";
export const PROPS_LIQUID_OP = "liquidLP";

/** The pressures the witness ships [Pa], held to its flowsheetDict by the
 *  test.  The first two are the plant's own drums; the purge's is
 *  author-set (a fuel header for the lesson). */
export const SHIPPED_P_OUT: Readonly<Record<ValveName, number>> = {
  ValveHP: 20e5, ValveLP: 1.01325e5, PurgeValve: 2e5,
};

/** The page's override of the second throttle's outlet pressure: the
 *  storage pressure.  `P` occurrence 2 in the flowsheet is ValveLP's. */
export function storagePressureOverride(P2_Pa: number): DictOverride[] {
  return [{ file: FLOWSHEET, key: "P", value: P2_Pa / 1e5, unit: "bar",
    occurrence: 2 }];
}

// ---- The defaults the reader may change, and why each is what it is ---------

/** F_L, the liquid pressure recovery factor: the `fluids` sizing function's
 *  own keyword default (size_control_valve_l, FL=0.9; its docstring: about
 *  0.8 to 0.9 at full opening, falling as the valve opens further).  Not a
 *  value for any valve; the valve's maker states its own. */
export const FL_DEFAULT = 0.9;
/** x_T, the gas pressure-differential ratio factor at choked flow: the
 *  `fluids` gas sizing function's own keyword default (xT=0.7). */
export const XT_DEFAULT = 0.7;
/** The bore of the line before and after the valve, for the velocity rows
 *  [m]: a round number for the lesson, not a line anybody sized. */
export const LINE_BORE_DEFAULT = 0.1;
/** The efficiency of a power-recovery turbine: a round number for the
 *  lesson, not a machine's; the maker of a real one states its own. */
export const TURBINE_EFF_DEFAULT = 0.75;

// ---- Reading the runs -----------------------------------------------------

export interface ValveReading {
  P_in: number; P_out: number; T_in: number; T_out: number; dT: number;
  vf: number; F: number;
  massFlow?: number; Q_in?: number; Q_out?: number; rho_in?: number;
  rho_out?: number; volumeRatio?: number; x_mass_out?: number;
}

/** One valve's KPIs, or null when the run has not published the core set.
 *  The volumetric ones are optional: the engine withholds them, and says
 *  why, when a density cannot be had. */
export function readValve(r: RunResult | null | undefined, unit: ValveName):
  ValveReading | null {
  const k = r?.kpis?.[unit];
  if (!k) return null;
  const num = (key: string): number | undefined =>
    typeof k[key] === "number" && Number.isFinite(k[key]) ? k[key] : undefined;
  const P_in = num("P_in"), P_out = num("P_out"), T_in = num("T_in"),
    T_out = num("T_out"), dT = num("dT"), vf = num("vf"), F = num("F");
  if (P_in === undefined || P_out === undefined || T_in === undefined
    || T_out === undefined || dT === undefined || vf === undefined
    || F === undefined) return null;
  return {
    P_in, P_out, T_in, T_out, dT, vf, F,
    massFlow: num("massFlow"), Q_in: num("Q_in"), Q_out: num("Q_out"),
    rho_in: num("rho_in"), rho_out: num("rho_out"),
    volumeRatio: num("volumeRatio"), x_mass_out: num("x_mass_out"),
  };
}

export interface PropsReading {
  T: number; P: number; k: number; Z: number; Cp_ig: number;
  Psat_NH3?: number;
}

/** One propertyPoint operation of letdown02, or null. */
export function readProps(r: RunResult | null | undefined, op: string):
  PropsReading | null {
  const d = r?.operationResults?.find((o) => o.name === op)?.diagnostics;
  if (!d) return null;
  const num = (key: string): number | undefined =>
    typeof d[key] === "number" && Number.isFinite(d[key]) ? d[key] : undefined;
  const T = num("T"), P = num("P"), k = num("gamma"), Z = num("Z"),
    Cp = num("Cp_ig");
  if (T === undefined || P === undefined || k === undefined || Z === undefined
    || Cp === undefined) return null;
  return { T, P, k, Z, Cp_ig: Cp, Psat_NH3: num("Psat_NH3") };
}

/** One top-level scalar of a component record a witness carries. */
export function recordScalar(
  raw: { [rel: string]: string } | undefined, comp: string, key: string,
): number | undefined {
  const body = raw?.[`constant/components/${comp}.dat`];
  if (!body) return undefined;
  const m = new RegExp(`^${key}\\s+([0-9.eE+-]+)\\s*;`, "m").exec(body);
  return m ? Number(m[1]) : undefined;
}

// ---- Part 1: the volume and the line ---------------------------------------

/** Mean velocity of a volumetric flow Q [m3/s] in a round bore D [m]. */
export function lineVelocity(Q: number, D: number): number {
  return Q / (Math.PI * D * D / 4);
}

/** The hand estimate of the flashed fraction: the liquid's sensible heat
 *  between the two temperatures, paid as latent heat.  Molar, with a
 *  constant liquid heat capacity and latent heat. */
export function flashFractionEstimate(cpL: number, T1: number, T2: number,
  lambda: number): number {
  return cpL * (T1 - T2) / lambda;
}

// ---- Part 2: gas -------------------------------------------------------------

export { criticalPressureRatio };

/** IEC 60534-2-1's specific heat ratio factor F_gamma = k/1.4. */
export function specificHeatRatioFactor(k: number): number {
  return k / 1.4;
}

/** The pressure-drop ratio x = (P1 - P2)/P1 at which a gas valve chokes. */
export function chokedPressureRatio(k: number, xT: number): number {
  return specificHeatRatioFactor(k) * xT;
}

/** The expansion factor Y = 1 - x/(3 F_gamma x_T), floored at 2/3 (its value
 *  at the choke), as the fluids implementation writes it. */
export function expansionFactor(x: number, k: number, xT: number): number {
  return Math.max(1 - x / (3 * specificHeatRatioFactor(k) * xT), 2 / 3);
}

/** The valve's mass flow as a FRACTION of its choked flow, at fixed P1, T1
 *  and opening: W is proportional to Y sqrt(x) below the choke and constant
 *  above it. */
export function valveFlowFraction(x: number, k: number, xT: number): number {
  const xc = chokedPressureRatio(k, xT);
  if (x <= 0) return 0;
  if (x >= xc) return 1;
  return expansionFactor(x, k, xT) * Math.sqrt(x)
    / ((2 / 3) * Math.sqrt(xc));
}

/** An ideal isentropic nozzle's mass flux as a FRACTION of its choked flux,
 *  against the same x = 1 - P2/P1 (de Saint-Venant/Wantzel, the derivation
 *  the overpressure page's critical coefficient rests on). */
export function nozzleFlowFraction(x: number, k: number): number {
  const rc = criticalPressureRatio(k);
  const r = 1 - x;
  if (x <= 0) return 0;
  if (r <= rc) return 1;
  const psi = (q: number) => Math.sqrt(q ** (2 / k) - q ** ((k + 1) / k));
  return psi(r) / psi(rc);
}

// ---- Part 3: liquid ------------------------------------------------------------

/** The vena-contracta pressure, from the definition of F_L:
 *  F_L^2 = (P1 - P2)/(P1 - P_vc).  It can come out below zero: a liquid
 *  cannot follow it there, and the page says so rather than drawing it. */
export function venaContractaPressure(P1: number, P2: number, FL: number): number {
  return P1 - (P1 - P2) / (FL * FL);
}

/** IEC 60534-2-1's liquid critical pressure ratio factor. */
export function liquidCriticalRatioFactor(Pv: number, Pc: number): number {
  return 0.96 - 0.28 * Math.sqrt(Pv / Pc);
}

/** The largest pressure drop that still raises a liquid valve's flow:
 *  beyond it the flow is choked. */
export function chokedLiquidDrop(P1: number, Pv: number, Pc: number, FL: number): number {
  return FL * FL * (P1 - liquidCriticalRatioFactor(Pv, Pc) * Pv);
}

/** ISA RP75.23's cavitation index (as fluids cites it): larger is safer. */
export function cavitationIndex(P1: number, P2: number, Pv: number): number {
  return (P1 - Pv) / (P1 - P2);
}

export type LiquidRegime = "flashing" | "cavitation" | "neither";

/** Which of the three things a liquid does in the valve, read from where
 *  the vena-contracta pressure and the outlet pressure sit against the
 *  vapour pressure. */
export function liquidRegime(P1: number, P2: number, Pv: number, FL: number): LiquidRegime {
  if (P2 <= Pv) return "flashing";
  if (venaContractaPressure(P1, P2, FL) <= Pv) return "cavitation";
  return "neither";
}

// ---- Part 4: stages, turbines --------------------------------------------------

export interface Stage { i: number; P_in: number; P_out: number; P_vc: number }

/** The drop P1 -> P2 taken in n stages of EQUAL PRESSURE RATIO, each with
 *  the same F_L.  This page's model, said to be one. */
export function stagedDrop(P1: number, P2: number, n: number, FL: number): Stage[] {
  const out: Stage[] = [];
  const r = (P2 / P1) ** (1 / n);
  let p = P1;
  for (let i = 1; i <= n; i++) {
    const q = i === n ? P2 : p * r;
    out.push({ i, P_in: p, P_out: q, P_vc: venaContractaPressure(p, q, FL) });
    p = q;
  }
  return out;
}

/** The fewest equal-ratio stages whose every vena contracta stays above the
 *  vapour pressure, or null when no count up to `maxN` does -- which is
 *  always the case once the outlet itself is below it (flashing). */
export function stagesToAvoidVapour(P1: number, P2: number, Pv: number,
  FL: number, maxN = 20): number | null {
  if (P2 <= Pv) return null;
  for (let n = 1; n <= maxN; n++)
    if (stagedDrop(P1, P2, n, FL).every((s) => s.P_vc > Pv)) return n;
  return null;
}

/** The hydraulic power a liquid's pressure drop represents [W]: Q dP, for an
 *  incompressible liquid -- what a valve turns into heat and an ideal
 *  turbine would deliver at its shaft. */
export function hydraulicPower(Q_m3_s: number, dP_Pa: number): number {
  return Q_m3_s * dP_Pa;
}

/** An ideal-gas isentropic expansion from T1 at a pressure ratio r = P2/P1:
 *  the outlet temperature [K] and the work it delivers [W] for a molar flow
 *  F [kmol/s] with an ideal-gas heat capacity Cp [J/(mol K)] and ratio k. */
export function idealExpander(F_kmol_s: number, Cp: number, T1: number,
  k: number, r: number): { T2s: number; W: number } {
  const T2s = T1 * r ** ((k - 1) / k);
  return { T2s, W: F_kmol_s * 1000 * Cp * (T1 - T2s) };
}

// ---- Part 5: sound -------------------------------------------------------------

/** How many decibels apart two sound powers are: 10 log10(Wa/Wb).  The page
 *  uses it only as a RATIO -- on the assumption, said where it is used, that
 *  the same fraction of each valve's dissipated power becomes sound, which
 *  is the very fraction the IEC 60534-8 methods exist to compute. */
export function levelDifference(Wa: number, Wb: number): number {
  return 10 * Math.log10(Wa / Wb);
}
