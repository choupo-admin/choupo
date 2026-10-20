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
  poolFire -- the ONE home of the arithmetic behind "The radiation of a pool
  fire, and the distance it sets" (DEV.md 4c C83).  React-free, so
  tests/poolFire.test.ts can hold every number the page prints.

  WHAT IS THE CATALOGUE'S AND WHAT IS THIS FILE'S.  Every property of a
  SUBSTANCE is read from the catalogue record the engine reads
  (data/standards/components/<name>.dat): the formula, the molar mass, the
  normal boiling point, the critical temperature, the latent heat at the
  boiling point, the liquid molar volume, the liquid heat capacity and the
  ideal-gas formation enthalpy.  Nothing about a fuel is typed here.  Two
  closed forms are applied to those numbers and both are the ENGINE'S OWN:
  the Watson latent heat (src/thermo/Component.cpp:1286-1294) and the
  gas-to-liquid crossing at 298.15 K (Component.cpp:1133-1134); the test
  holds the first to a number the engine prints in a pinned golden.  What
  this file computes beyond that is the pool-fire PROCEDURE -- the burning
  rate, the flame, the emissive power, the view factor -- which is a
  calculation procedure on published correlations, not a property, on the
  overpressure.ts precedent.  No Choupo engine code carries any of it.

  WHERE EACH CORRELATION WAS READ is in poolFireLesson.ts (POOL_SOURCES),
  with its licence status.  The measured anchors below are from US
  government publications (public domain): NIST Technical Notes 2082 and
  2083 and US Bureau of Mines Bulletin 680.  No table of a no-grant
  handbook is transcribed: there is NO per-fuel k-beta in this file, and
  the page derives one from a public-domain measurement instead.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../../dict/index.js";
import type { JsonValue } from "../../dict/json.js";

// ---- Constants ----------------------------------------------------------------

/** The ambient state the page assumes: 25 C and one standard atmosphere.
 *  The same 298 K the EPA guidance assumes for its pool-fire factor. */
export const AMBIENT_T_K = 298.15;
export const AMBIENT_P_PA = 101325;
/** The molar gas constant [J/(mol K)], exact since the 2019 SI. */
export const R_GAS = 8.314462618;
/** Standard gravity [m/s2]. */
export const G_STD = 9.80665;
/** The Watson exponent, as the engine applies it (Component.cpp:1294). */
export const WATSON_EXPONENT = 0.38;
/** The Burgess-Strasser-Grumer constant of m''_inf = C dHc/dHg [kg/(m2 s)],
 *  as the EPA guidance (Appendix D, Eq. D-23) and Shokri & Beyler (Eq. 5)
 *  print it. */
export const BURGESS_C = 1e-3;
/** Thomas's flame-length correlation, L/D = 42 (m''/(rho_a sqrt(g D)))^0.61. */
export const THOMAS_A = 42;
export const THOMAS_N = 0.61;
/** Heskestad's flame height, L = 0.23 Q^(2/5) - 1.02 D (Q in kW). */
export const HESKESTAD_A = 0.23;
export const HESKESTAD_B = 1.02;
/** Mudan & Croce's effective emissive power for gasoline, kerosene and JP-4
 *  flames: E = E_max exp(-s D) + E_s (1 - exp(-s D)) [kW/m2, m]. */
export const MUDAN_EMAX_KW = 140;
export const MUDAN_ES_KW = 20;
export const MUDAN_S = 0.12;

/** 1 Btu/(h ft2) in W/m2 (International Table Btu, 0.3048 m ft). */
export const BTU_H_FT2_W_M2 = (1055.05585262 / 3600) / (0.3048 * 0.3048);
/** 1 cal/(s cm2) in W/m2 (thermochemical calorie, 4.184 J). */
export const CAL_S_CM2_W_M2 = 4.184e4;

// ---- The fuels -------------------------------------------------------------

/** The fuels the page offers: the two the corpus' plants carry, and for
 *  which a public-domain measurement exists to calibrate k-beta.  The set is
 *  limited to what can be cited, and the page says so. */
export const POOL_FUELS = ["methanol", "acetone"] as const;
export type PoolFuel = typeof POOL_FUELS[number];

/** The corpus plant each fuel appears in (held to the plant's own
 *  thermoPhysPropDict by the test). */
export const FUEL_PLANT: Readonly<Record<PoolFuel, string>> = {
  methanol: "plant/aceticAcid02_plant",
  acetone: "plant/acetonePlant",
};

/** A measured pool fire, from a public-domain NIST report. */
export interface MeasuredPool {
  /** Pan inner diameter [m]. */
  D_m: number;
  /** Steady mass burning flux [kg/(m2 s)]. */
  m_kg_m2s: number;
  /** Radiative fraction to the surroundings, or null when not reported. */
  chi_r: number | null;
  /** Mean flame height [m], or null when not used. */
  L_m: number | null;
  /** The spread (the ±) the report gives on that flame height [m]. */
  L_sd_m: number | null;
  /** Which source (an id of POOL_SOURCES). */
  source: string;
  /** What the number is, in a phrase. */
  what: string;
}

/** The measurements the page leans on.  The FIRST entry of each fuel is the
 *  one k-beta is calibrated on (30 cm, the averages NIST TN 2082 Table 5
 *  compiles); the 1 m methanol fire of TN 2083 is held back as a CHECK. */
export const MEASURED: Readonly<Record<PoolFuel, readonly MeasuredPool[]>> = {
  methanol: [
    { D_m: 0.301, m_kg_m2s: 13.2e-3, chi_r: 0.20, L_m: 0.364, L_sd_m: 0.160,
      source: "nist-tn2082",
      what: "30 cm pan: average mass burning flux and radiative fraction of the "
        + "studies compiled in Table 5; mean flame height from Table 1" },
    { D_m: 1.00, m_kg_m2s: 12.8e-3 / (Math.PI / 4), chi_r: 0.22, L_m: 1.10, L_sd_m: 0.22,
      source: "nist-tn2083",
      what: "1 m pan: 12.8 g/s over the pan area, radiative fraction 0.22, "
        + "mean flame height 1.10 m" },
  ],
  acetone: [
    { D_m: 0.301, m_kg_m2s: 18.3e-3, chi_r: 0.27, L_m: 0.915, L_sd_m: 0.346,
      source: "nist-tn2082",
      what: "30 cm pan: average mass burning flux and radiative fraction of the "
        + "studies compiled in Table 5; mean flame height from Table 1" },
  ],
};

/** US Bureau of Mines Bulletin 680, Table 21: the linear burning rate at
 *  infinite diameter [cm/min] and the radiated fraction.  Methanol is the
 *  only one of the page's fuels in that table. */
export const USBM_TABLE21: Readonly<Partial<Record<PoolFuel, { v_cm_min: number; chi_r: number }>>> = {
  methanol: { v_cm_min: 0.17, chi_r: 0.17 },
};

/** The catalogue facts a pool needs, read from one record. */
export interface FuelRecord {
  name: string;
  formula: string;
  /** Atoms per molecule: carbon, hydrogen, oxygen. */
  C: number; H: number; O: number;
  /** Molar mass [kg/kmol = g/mol]. */
  MW: number;
  Tb: number; Tc: number;
  /** Latent heat at the normal boiling point [J/mol]. */
  HvapTb: number;
  /** Liquid molar volume at 25 C [m3/mol]. */
  Vliq: number;
  /** Liquid heat capacity [J/(mol K)]: the record's one-term polynomial. */
  CpLiq: number;
  /** Ideal-gas formation enthalpy at 298.15 K [J/mol]. */
  dHf: number;
}

function num(v: JsonValue | undefined): number | undefined {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && !Array.isArray(v)
    && typeof (v as { value?: unknown }).value === "number")
    return (v as { value: number }).value;
  return undefined;
}

function need(name: string, key: string, v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v))
    throw new Error(`component '${name}': the record declares no ${key}, `
      + "so the pool fire cannot be computed from it");
  return v;
}

/** Atoms of C, H and O in a formula such as CH4O or C3H6O.  Any other
 *  element REFUSES: the combustion below writes CO2 and H2O only. */
export function chOAtoms(formula: string): { C: number; H: number; O: number } {
  const out = { C: 0, H: 0, O: 0 };
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  let seen = "";
  while ((m = re.exec(formula)) !== null) {
    if (m[0] === "") break;
    seen += m[0];
    const el = m[1]!;
    const n = m[2] ? Number(m[2]) : 1;
    if (el !== "C" && el !== "H" && el !== "O")
      throw new Error(`formula ${formula}: element ${el} is not C, H or O; `
        + "this page burns only to CO2 and H2O");
    out[el] += n;
  }
  if (seen !== formula) throw new Error(`formula ${formula} could not be read`);
  return out;
}

/** The record's ideal-gas formation enthalpy [J/mol]. */
export function formationEnthalpy(body: string): number {
  const j = toJson(parse(body));
  const st = j.standardThermochemistry as { [k: string]: JsonValue } | undefined;
  const name = typeof j.name === "string" ? j.name : "?";
  return need(name, "standardThermochemistry.dHf_298", num(st?.dHf_298));
}

/** Read one fuel's facts from its catalogue record (the raw .dat text). */
export function fuelFromRecord(body: string): FuelRecord {
  const j = toJson(parse(body));
  const name = typeof j.name === "string" ? j.name : "?";
  const formula = typeof j.formula === "string" ? j.formula : "";
  const st = j.standardThermochemistry as { [k: string]: JsonValue } | undefined;
  if (st && typeof st.referenceState === "string" && st.referenceState !== "idealGas")
    throw new Error(`component '${name}': its formation datum is on the `
      + `${st.referenceState} rung, and this page reads the ideal-gas one`);
  const cpl = j.liquidHeatCapacity as { [k: string]: JsonValue } | undefined;
  const coeffs = Array.isArray(cpl?.coefficients) ? cpl!.coefficients as JsonValue[] : [];
  if (cpl?.model !== "polynomial" || coeffs.length !== 1)
    throw new Error(`component '${name}': the page reads a CONSTANT liquid heat `
      + "capacity (a one-term polynomial), and this record declares another form");
  return {
    name, formula, ...chOAtoms(formula),
    MW: need(name, "MW", num(j.MW)),
    Tb: need(name, "Tb", num(j.Tb)),
    Tc: need(name, "Tc", num(j.Tc)),
    HvapTb: need(name, "HvapTb", num(j.HvapTb)),
    Vliq: need(name, "Vliq", num(j.Vliq)),
    CpLiq: need(name, "liquidHeatCapacity", num(coeffs[0])),
    dHf: need(name, "standardThermochemistry.dHf_298", num(st?.dHf_298)),
  };
}

// ---- Step 2: the heat of combustion ---------------------------------------------

/** The formation enthalpies of the products, as the records declare them. */
export interface Products { dHf_CO2: number; dHf_H2O: number; dHf_O2: number }

/** Moles of O2 per mole of fuel: C + H/4 - O/2. */
export function oxygenDemand(f: Pick<FuelRecord, "C" | "H" | "O">): number {
  return f.C + f.H / 4 - f.O / 2;
}

/** Lower heating value of the VAPOUR at 298.15 K [J/mol], positive: Hess's
 *  sum over the formation enthalpies, water leaving as vapour. */
export function lhvVapour(f: FuelRecord, p: Products): number {
  const products = f.C * p.dHf_CO2 + (f.H / 2) * p.dHf_H2O;
  const reactants = f.dHf + oxygenDemand(f) * p.dHf_O2;
  return reactants - products;
}

/** The latent heat at T by Watson from the record's own data [J/mol] -- the
 *  engine's Component::Hvap_latent, the same exponent. */
export function watsonHvap(f: Pick<FuelRecord, "Tb" | "Tc" | "HvapTb">, T: number): number {
  if (T >= f.Tc) return 0;
  return f.HvapTb * ((f.Tc - T) / (f.Tc - f.Tb)) ** WATSON_EXPONENT;
}

/** Lower heating value of the LIQUID at 298.15 K [J/mol]: the vapour's,
 *  less the latent heat at 298.15 K -- the crossing the engine takes when
 *  it prices a gas-datum species as a liquid (Component.cpp:1133-1134). */
export function lhvLiquid(f: FuelRecord, p: Products): number {
  return lhvVapour(f, p) - watsonHvap(f, AMBIENT_T_K);
}

/** Per kilogram [J/kg]. */
export const perKg = (J_mol: number, MW: number): number => J_mol / (MW / 1000);

// ---- Step 3: the burning rate -----------------------------------------------------

/** The heat to gasify a kilogram of the liquid from ambient [J/kg]: heat it
 *  to its boiling point, then vaporise it there. */
export function gasificationHeat(f: FuelRecord, Ta = AMBIENT_T_K): number {
  return perKg(f.HvapTb + f.CpLiq * (f.Tb - Ta), f.MW);
}

/** The Burgess-Strasser-Grumer asymptotic burning flux [kg/(m2 s)]. */
export function burgessMinf(dHc_J_kg: number, dHg_J_kg: number): number {
  return BURGESS_C * dHc_J_kg / dHg_J_kg;
}

/** The liquid density from the record's molar volume at 25 C [kg/m3]. */
export function liquidDensity(f: Pick<FuelRecord, "MW" | "Vliq">): number {
  return (f.MW / 1000) / f.Vliq;
}

/** A linear regression rate [cm/min] as a mass flux [kg/(m2 s)]. */
export function regressionToFlux(v_cm_min: number, rho: number): number {
  return rho * (v_cm_min / 100) / 60;
}

/** The burning flux at diameter D [kg/(m2 s)]. */
export function burningFlux(mInf: number, kBeta: number, D: number): number {
  return mInf * (1 - Math.exp(-kBeta * D));
}

/** The k-beta that one measured pool implies, given m''_inf [1/m].  NaN when
 *  the measurement is not below m''_inf (the curve cannot pass through it). */
export function kBetaFromMeasurement(mInf: number, mMeas: number, D: number): number {
  if (!(mMeas > 0 && mMeas < mInf && D > 0)) return NaN;
  return -Math.log(1 - mMeas / mInf) / D;
}

/** The heat release rate [W]. */
export function heatRelease(m: number, D: number, dHc_J_kg: number): number {
  return m * (Math.PI * D * D / 4) * dHc_J_kg;
}

// ---- Step 5: the flame height ----------------------------------------------------

/** Ambient air density [kg/m3]: ideal gas at the page's ambient state. */
export function airDensity(M_air_g_mol: number, T = AMBIENT_T_K, P = AMBIENT_P_PA): number {
  return P * (M_air_g_mol / 1000) / (R_GAS * T);
}

/** Thomas's mean flame length [m]. */
export function thomasHeight(m: number, D: number, rhoA: number): number {
  return THOMAS_A * D * (m / (rhoA * Math.sqrt(G_STD * D))) ** THOMAS_N;
}

/** Heskestad's mean flame height [m] (Q in W). */
export function heskestadHeight(Q_W: number, D: number): number {
  return HESKESTAD_A * (Q_W / 1000) ** 0.4 - HESKESTAD_B * D;
}

/** The range of Q^(2/5)/D [kW^(2/5)/m] over which Heskestad's height was
 *  tested, as NBSIR 88-3755 states it. */
export const HESKESTAD_RANGE: readonly [number, number] = [7, 700];

/** Heskestad's group Q^(2/5)/D [kW^(2/5)/m] (Q in W). */
export function heskestadGroup(Q_W: number, D: number): number {
  return (Q_W / 1000) ** 0.4 / D;
}

// ---- Step 6: the surface emissive power --------------------------------------------

/** Mudan & Croce's effective emissive power [W/m2]. */
export function mudanSEP(D: number): number {
  const e = Math.exp(-MUDAN_S * D);
  return 1000 * (MUDAN_EMAX_KW * e + MUDAN_ES_KW * (1 - e));
}

/** The emissive power that makes the cylinder's side radiate exactly the
 *  radiated fraction of the heat release [W/m2]: chi_r Q = (pi D) L E. */
export function energySEP(chiR: number, Q_W: number, D: number, L: number): number {
  return chiR * Q_W / (Math.PI * D * L);
}

/** The radiated fraction a given emissive power implies on the cylinder. */
export function impliedChi(E: number, Q_W: number, D: number, L: number): number {
  return E * Math.PI * D * L / Q_W;
}

// ---- Step 7 and 8: the receiver ----------------------------------------------------------

/** The point-source flux [W/m2] at a receiver x metres from the pool AXIS
 *  (horizontally) and z metres above the ground, the point at half the flame
 *  height: q = tau chi Q / (4 pi r^2). */
export function pointSourceFlux(tau: number, chiR: number, Q_W: number,
  x: number, z: number, L: number): number {
  const r2 = x * x + (L / 2 - z) ** 2;
  return tau * chiR * Q_W / (4 * Math.PI * r2);
}

/** The view factor from a vertical cylinder of radius R and height H, whose
 *  base is level with a vertical receiver x from its axis and facing it
 *  (Shokri & Beyler 1989, Eq. 6b; S = x/R, h = H/R). */
export function cylinderViewFactor(S: number, h: number): number {
  if (!(S > 1)) return NaN;
  if (h <= 0) return 0;
  const A = (h * h + S * S + 1) / (2 * S);
  const t1 = Math.atan(h / Math.sqrt(S * S - 1)) / (Math.PI * S);
  const t2 = (h / (Math.PI * S)) * Math.atan(Math.sqrt((S - 1) / (S + 1)));
  const t3 = (A * h / (Math.PI * S * Math.sqrt(A * A - 1)))
    * Math.atan(Math.sqrt(((A + 1) * (S - 1)) / ((A - 1) * (S + 1))));
  return t1 - t2 + t3;
}

/** The view factor from a flame cylinder (diameter D, height L, standing on
 *  the ground) to a vertical receiver x from its axis at height z: the
 *  cylinder split at the receiver's level into the part above and the part
 *  below, each a difference of two cylinders whose base is level with it. */
export function flameViewFactor(x: number, D: number, L: number, z: number): number {
  const R = D / 2;
  const S = x / R;
  const seg = (near: number, far: number): number =>
    far <= near ? 0
      : cylinderViewFactor(S, far / R) - cylinderViewFactor(S, near / R);
  const above = L > z ? seg(Math.max(0, -z), L - z) : 0;
  const below = z > 0 ? seg(Math.max(0, z - L), z) : 0;
  return above + below;
}

/** The solid-flame flux [W/m2]: q = tau F E. */
export function solidFlameFlux(tau: number, E: number, x: number,
  D: number, L: number, z: number): number {
  return tau * flameViewFactor(x, D, L, z) * E;
}

// ---- Step 11: the thresholds ----------------------------------------------------------

export interface Threshold {
  id: string;
  /** The flux [W/m2]. */
  q: number;
  /** A short label for the chart and the table. */
  label: string;
  /** What reaching it means, in the source's own terms (paraphrased). */
  means: string;
  /** An id of POOL_SOURCES. */
  source: string;
  /** WHO the threshold is for: a person's harm follows a dose (flux AND
   *  time), a building's ignition does not on this page. */
  target: "person" | "building";
  /** The exposure time the source attaches to the flux, in a few words, so
   *  it can stand BESIDE every distance and line the page draws (C112
   *  point 14).  Never "safe": each says what the source says and no more. */
  exposure: string;
}

/** Every threshold the page draws, lowest first.  Each value is CONVERTED
 *  here from the unit its source states it in; none is a rounded copy. */
export const THRESHOLDS: readonly Threshold[] = [
  { id: "hud-people", q: 450 * BTU_H_FT2_W_M2,
    label: "1.42 kW/m2 HUD, people outdoors",
    means: "the limit for outdoor, unprotected facilities or areas of "
      + "congregation near a hazard (450 Btu/(h ft2)), with no exposure time "
      + "attached",
    source: "hud-24cfr51", target: "person",
    exposure: "no exposure time stated by the source" },
  { id: "usbm-pain", q: 0.1 * CAL_S_CM2_W_M2,
    label: "4.18 kW/m2 USBM, pain after a short time",
    means: "humans feel pain after a short time (0.1 cal/(s cm2)); the same "
      + "Bulletin reads it as about the threshold for second-degree burns at "
      + "exposures of minutes",
    source: "usbm-b680", target: "person",
    exposure: "pain after a short time; second-degree burns over minutes" },
  { id: "epa-rmp", q: 5000,
    label: "5 kW/m2 for 40 s, EPA RMP endpoint",
    means: "the endpoint of a fire in an offsite consequence analysis: 5 kW/m2 "
      + "for 40 seconds, the dose the guidance associates with second-degree "
      + "burns, assuming a person escapes within 40 s",
    source: "epa-rmp", target: "person",
    exposure: "40 s: a dose, t q^(4/3), not a flux alone" },
  { id: "hud-buildings", q: 10000 * BTU_H_FT2_W_M2,
    label: "31.5 kW/m2 HUD, buildings",
    means: "the limit for a building near a hazard (10,000 Btu/(h ft2))",
    source: "hud-24cfr51", target: "building",
    exposure: "a building, not a person: no exposure time stated" },
];

/** The EPA endpoint's dose, 40 s at 5 kW/m2, in (W/m2)^(4/3) s: step 11's
 *  t_e q^(4/3) = 40 x 5000^(4/3). */
export const EPA_DOSE = 40 * Math.pow(5000, 4 / 3);

/** The exposure time [s] at which a constant flux q [W/m2] delivers the EPA
 *  endpoint's dose, t = EPA_DOSE / q^(4/3) -- 40 s at 5 kW/m2, 2^(4/3) times
 *  longer at half the flux.  The page shows it BESIDE the flux at the
 *  receiver so a reader sees that a person's harm is a dose; it is the
 *  guidance's dose rule, not a prediction of injury for a given person. */
export function epaDoseTime(q: number): number {
  return q > 0 ? EPA_DOSE / Math.pow(q, 4 / 3) : Infinity;
}

// ---- Step 1 and 12: the distance to a flux ---------------------------------------------

/** The distance from the pool AXIS at which q(x) falls to qT [m], by
 *  bisection on a function that decreases with x outside the pool.  Returns
 *  null when even at the flame's surface the flux is below qT -- the
 *  threshold is never reached outside the fire. */
export function distanceTo(q: (x: number) => number, qT: number, R: number): number | null {
  let lo = R * (1 + 1e-9);
  if (!(q(lo) > qT)) return null;
  let hi = Math.max(2 * R, 1);
  while (q(hi) > qT) {
    hi *= 2;
    if (hi > 1e7) return null;
  }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (q(mid) > qT) lo = mid; else hi = mid;
    if (hi - lo < 1e-9 * hi) break;
  }
  return 0.5 * (lo + hi);
}

// ---- The layout case's separation table ------------------------------------------

/** The layout case this page quotes: the plant that carries methanol. */
export const LAYOUT_CASE = "plant/aceticAcid02_plant";

export interface SeparationRule { a: string; b: string; distance_m: number }

/** The `separation` table of a layoutDict: its measure word, its source and
 *  its pairs.  Read from the case's own text, never typed here. */
export function readSeparation(layoutDict: string): {
  measure: string; source: string; rules: SeparationRule[];
} {
  const at = layoutDict.search(/^separation\s*$/m);
  if (at < 0) throw new Error("the layoutDict declares no separation table");
  const block = layoutDict.slice(at);
  const measure = /measure\s+(\w+)\s*;/.exec(block)?.[1];
  const source = /source\s+"([^"]*)"\s*;/.exec(block)?.[1];
  if (!measure || source === undefined)
    throw new Error("the separation table declares no measure or no source");
  const rules: SeparationRule[] = [];
  const end = block.search(/^\);/m);
  for (const r of block.slice(0, end < 0 ? undefined : end)
    .matchAll(/between\s*\(\s*(\w+)\s+(\w+)\s*\)\s*;\s*distance\s+([0-9.eE+-]+)\s*m\s*;/g))
    rules.push({ a: r[1]!, b: r[2]!, distance_m: Number(r[3]) });
  return { measure, source, rules };
}

// ---- The whole fire, for the bench ---------------------------------------------------

export type FlameHeightModel = "thomas" | "heskestad";
export type SepModel = "energy" | "mudan";

export interface PoolFireInput {
  fuel: FuelRecord;
  products: Products;
  /** Molar mass of air [g/mol], from the air record. */
  M_air: number;
  D: number;
  kBeta: number;
  chiR: number;
  flame: FlameHeightModel;
  sep: SepModel;
  /** Receiver height above the ground [m]. */
  z: number;
  /** Atmospheric transmissivity. */
  tau: number;
}

export interface PoolFire {
  lhvVap_J_mol: number;
  hvap298_J_mol: number;
  lhvLiq_J_mol: number;
  dHc: number;
  dHg: number;
  mInf: number;
  m: number;
  Q: number;
  rhoA: number;
  L_thomas: number;
  L_heskestad: number;
  L: number;
  E_energy: number;
  E_mudan: number;
  E: number;
  chiImplied: number;
  /** The fluxes [W/m2] at x from the pool axis. */
  qPoint: (x: number) => number;
  qSolid: (x: number) => number;
}

export function poolFire(i: PoolFireInput): PoolFire {
  const lhvVap = lhvVapour(i.fuel, i.products);
  const hv298 = watsonHvap(i.fuel, AMBIENT_T_K);
  const lhvLiq = lhvVap - hv298;
  const dHc = perKg(lhvLiq, i.fuel.MW);
  const dHg = gasificationHeat(i.fuel);
  const mInf = burgessMinf(dHc, dHg);
  const m = burningFlux(mInf, i.kBeta, i.D);
  const Q = heatRelease(m, i.D, dHc);
  const rhoA = airDensity(i.M_air);
  const L_thomas = thomasHeight(m, i.D, rhoA);
  const L_heskestad = heskestadHeight(Q, i.D);
  const L = i.flame === "thomas" ? L_thomas : L_heskestad;
  const E_energy = energySEP(i.chiR, Q, i.D, L);
  const E_mudan = mudanSEP(i.D);
  const E = i.sep === "energy" ? E_energy : E_mudan;
  return {
    lhvVap_J_mol: lhvVap, hvap298_J_mol: hv298, lhvLiq_J_mol: lhvLiq,
    dHc, dHg, mInf, m, Q, rhoA, L_thomas, L_heskestad, L,
    E_energy, E_mudan, E, chiImplied: impliedChi(E, Q, i.D, L),
    qPoint: (x) => pointSourceFlux(i.tau, i.chiR, Q, x, i.z, L),
    qSolid: (x) => solidFlameFlux(i.tau, E, x, i.D, L, i.z),
  };
}

// ---- Step 11, beside the bench: exposure, never a safe/harm line (C112 point 14) ----

/** The sentence beside the receiver's flux: the exposure time at which the
 *  EPA endpoint's dose is reached there (step 11).  Recomputed on every knob
 *  move because it is a function of the flux the page just drew. */
export function exposureSentence(q: number): string {
  if (!(q > 0)) return "";
  const t = epaDoseTime(q);
  const span = t < 120 ? `${t.toFixed(0)} s` : t < 7200 ? `${(t / 60).toFixed(1)} min` : `${(t / 3600).toFixed(1)} h`;
  return `At this flux the EPA endpoint's dose (5 kW/m2 for 40 s) is reached after ${span} of exposure: `
    + "a person's harm is a dose, so how long they stay matters as much as where they stand.";
}

/** Shown under the receiver's sentence whatever the knobs say. */
export const NOT_A_BOUNDARY = "No distance or flux on this page is a universal safe or harm boundary: "
  + "each threshold is a flux with the exposure its source states (or none), for a person or a building, "
  + "and real harm also depends on clothing, shelter, escape and on the fire's own variation.";
