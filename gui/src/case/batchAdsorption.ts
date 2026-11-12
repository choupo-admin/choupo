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
  batchAdsorption — the arithmetic of the `batch-adsorption` EduTool: a
  stirred tank of solution dosed with an adsorbent whose isotherm is known.

  The isotherm itself is NOT written here: q*(c) is `isothermQ` of
  gui/src/case/adsorptionIsotherms.ts (the `adsorption-isotherms` page), and
  the single-stage dose for a target is that file's `batchDose`.  One home
  for each formula; this file adds what the previous page did not need.

  WHY THIS IS THE PAGE'S OWN ARITHMETIC (measured 2026-11-12,
  docs/design/batch-adsorption-in-a-stirred-tank.md): the engine's
  `batchAdsorber` and `fixedBedAdsorber` (src/unitOperations/batch/) contact
  a GAS with the adsorbent, in partial pressure, and the isotherms it
  registers are `henry` and `langmuir` only
  (src/thermo/adsorbent/IsothermModel.cpp); there is no liquid phase and no
  Freundlich model.  Every number on the page is computed here.

  Units, one basis throughout: c in mg/L, q in mg/g, V in L, M in g -- so
  V c and M q are both milligrams and no conversion enters a balance.  The
  kinetic step works in SI (m, s, kg/m3, m2/s) and converts once.

  What is here:
    * the equilibrium state of one stage: the root of
      V (c0 - c) + M (q0 - q*(c)) = 0, by BISECTION on a bracket that always
      holds (f(0) > 0, f(c0 + M q0/V) < 0), with the closed forms for the
      linear and the Langmuir isotherm beside it, so a test can hold one to
      the other;
    * crossflow staging (fresh adsorbent in every stage, any split) and
      countercurrent staging (one solid stream through N stages), each
      returning its own stage-by-stage mass balance;
    * the best split of a fixed total between two crossflow stages, by a
      golden-section search;
    * the film-resistance uptake: -dc/dt = k_L a (c - c*(q)), with the
      closed form for the linear isotherm and a step-doubling RK4 for the
      others, and the time to reach a target;
    * the Biot number that says how much the film-only model leaves out.
\*---------------------------------------------------------------------------*/

import { batchDose, C_UNITS, isothermQ, Q_UNITS, type ModelId } from "./adsorptionIsotherms.js";

export interface Isotherm { model: ModelId; params: readonly number[] }

/** q*(c), mg/g at mg/L: the previous page's function, never a copy. */
export const qStar = (iso: Isotherm, c: number): number => isothermQ(iso.model, iso.params, c);

/** The liquid concentration in equilibrium with a loading q (the inverse
 *  isotherm), mg/L.  Langmuir has none at or above q_max: Infinity. */
export function cStar(iso: Isotherm, q: number): number {
  if (q <= 0) return 0;
  const p = iso.params;
  if (iso.model === "linear") return q / p[0]!;
  if (iso.model === "langmuir") return q >= p[0]! ? Infinity : (p[1]! * q) / (p[0]! - q);
  return Math.pow(q / p[0]!, 1 / p[1]!);
}

/** Refuse an isotherm the page cannot use, by name; null when it is usable. */
export function isothermRefusal(iso: Isotherm): string | null {
  const p = iso.params;
  if (iso.model === "linear" && !(p[0]! > 0)) return "the linear constant K must be positive";
  if (iso.model === "langmuir" && !(p[0]! > 0 && p[1]! > 0)) return "q_max and K_L must both be positive";
  if (iso.model === "freundlich" && !(p[0]! > 0 && p[1]! > 0))
    return "K_F and the exponent 1/n must both be positive";
  return null;
}

// ---- one stage at equilibrium ---------------------------------------------------------

export interface Stage {
  /** Concentration leaving the stage, mg/L. */
  c: number;
  /** Loading on the adsorbent leaving the stage, mg/g. */
  q: number;
  /** Bisection iterations taken. */
  iterations: number;
}

/** The equilibrium of V L of solution at c0 with M g of adsorbent carrying
 *  q0: the c where the operating line q = q0 + (V/M)(c0 - c) meets q*(c).
 *  f(c) = V (c0 - c) + M (q0 - q*(c)) falls monotonically in c (q* rises),
 *  f(0) = V c0 + M q0 > 0 and f(c0 + M q0/V) = -M q*(.) < 0, so the bracket
 *  always holds and bisection always converges.  Stops when the bracket is
 *  narrower than 1e-15 of its upper end. */
export function stageEquilibrium(iso: Isotherm, V: number, M: number, c0: number, q0 = 0): Stage {
  if (!(M > 0)) return { c: c0, q: q0, iterations: 0 };
  const f = (c: number) => V * (c0 - c) + M * (q0 - qStar(iso, c));
  let lo = 0, hi = c0 + (M * q0) / V, it = 0;
  if (!(hi > 0)) return { c: 0, q: 0, iterations: 0 };
  for (; it < 200 && hi - lo > 1e-15 * hi; it++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  const c = 0.5 * (lo + hi);
  //  The loading from the BALANCE, not from the isotherm: then the stage's own
  //  balance closes to round-off whatever the bracket width.
  return { c, q: q0 + (V * (c0 - c)) / M, iterations: it };
}

/** The closed forms, where one exists (fresh or loaded adsorbent):
 *    linear:   c = (V c0 + M q0)/(V + M K)
 *    Langmuir: V c^2 + (V K_L + M q_max - A) c - A K_L = 0, A = V c0 + M q0,
 *              the positive root written as 2 A K_L/(b + sqrt(b^2 + 4 V A K_L))
 *              so it does not cancel when b > 0.
 *  Null for Freundlich, which has none. */
export function closedFormC(iso: Isotherm, V: number, M: number, c0: number, q0 = 0): number | null {
  const A = V * c0 + M * q0;
  if (iso.model === "linear") return A / (V + M * iso.params[0]!);
  if (iso.model === "langmuir") {
    const [qmax, KL] = [iso.params[0]!, iso.params[1]!];
    const b = V * KL + M * qmax - A;
    const disc = Math.sqrt(b * b + 4 * V * A * KL);
    return b > 0 ? (2 * A * KL) / (b + disc) : (-b + disc) / (2 * V);
  }
  return null;
}

/** Percent of the solute removed from the liquid. */
export const removalPct = (c0: number, c: number): number => (100 * (c0 - c)) / c0;

// ---- the inverse: the dose for a target ---------------------------------------------

export interface Dose { c: number; q: number; M_g: number; refused?: string }

/** M = V (c0 - c)/(q*(c) - q0) at c = c0 (1 - removal), through the previous
 *  page's `batchDose` (mg/L and mg/g).  A target at or below the equilibrium
 *  floor -- the c at which the adsorbent as charged already sits on its
 *  isotherm, q*(c) = q0 -- is refused by name, never clipped. */
export function doseFor(iso: Isotherm, V: number, c0: number, removalFrac: number, q0 = 0): Dose {
  const r = batchDose({
    model: iso.model, params: iso.params, cU: C_UNITS[0]!, qU: Q_UNITS[0]!,
    V_L: V, c0, removal: removalFrac, q0,
  });
  if (r.refused) {
    const floor = equilibriumFloor(iso, q0);
    const why = q0 > 0 && r.c <= floor
      ? `the target ${r.c.toPrecision(4)} mg/L lies at or below the equilibrium floor `
        + `c*(q0) = ${floor.toPrecision(4)} mg/L: an adsorbent that already carries `
        + `${q0} mg/g is in equilibrium with that concentration, so no dose takes the liquid lower`
      : r.refused;
    return { c: r.c, q: r.q, M_g: NaN, refused: why };
  }
  return { c: r.c, q: r.q, M_g: r.M_g };
}

/** The lowest concentration any dose can reach: the liquid in equilibrium
 *  with the adsorbent as charged.  Zero for fresh adsorbent. */
export const equilibriumFloor = (iso: Isotherm, q0: number): number => cStar(iso, q0);

// ---- staging --------------------------------------------------------------------------

export interface StagedResult {
  /** One entry per stage, in the order the LIQUID meets them. */
  stages: Stage[];
  /** Adsorbent mass in each stage, g (crossflow: each stage's own charge;
   *  countercurrent: the one solid stream, the same mass in every stage). */
  masses: number[];
  /** Concentration leaving the last stage, mg/L. */
  cOut: number;
  removal: number;
  /** |V c0 - (V c_out + solute carried off on the solid)| / (V c0): the
   *  balance over the whole arrangement, computed from the stage states. */
  balanceError: number;
  /** The largest balance error of any single stage, same normalisation. */
  stageBalanceError: number;
  refused?: string;
}

/** N crossflow stages: the liquid passes through them in turn and every stage
 *  gets FRESH adsorbent, `fractions[k]` of the total M. */
export function crossflow(iso: Isotherm, V: number, Mtotal: number, c0: number,
  fractions: readonly number[]): StagedResult {
  const stages: Stage[] = [], masses = fractions.map((f) => f * Mtotal);
  let cin = c0, stageErr = 0;
  for (const m of masses) {
    const s = stageEquilibrium(iso, V, m, cin, 0);
    stageErr = Math.max(stageErr, Math.abs(V * cin - (V * s.c + m * s.q)) / (V * c0));
    stages.push(s); cin = s.c;
  }
  const onSolid = stages.reduce((a, s, k) => a + masses[k]! * s.q, 0);
  return {
    stages, masses, cOut: cin, removal: removalPct(c0, cin),
    balanceError: Math.abs(V * c0 - (V * cin + onSolid)) / (V * c0), stageBalanceError: stageErr,
  };
}

/** Equal split of M over N crossflow stages. */
export const equalSplit = (N: number): number[] => Array.from({ length: N }, () => 1 / N);

/** N countercurrent stages: liquid enters stage 1 at c0 and leaves stage N;
 *  the one adsorbent stream of M g enters stage N fresh and leaves stage 1.
 *  Shooting on c_N: from stage N backwards the stage balances
 *    V (c_{k-1} - c_k) = M (q_k - q_{k+1}),  q_k = q*(c_k),  q_{N+1} = 0
 *  give c_0 as a function of c_N; bisection finds the c_N that returns the
 *  declared c0.  For N = 1 this is the single stage. */
export function countercurrent(iso: Isotherm, V: number, M: number, c0: number, N: number): StagedResult {
  const march = (cN: number): number[] => {
    const c = new Array<number>(N + 1).fill(0);   // c[0] = inlet, c[N] = outlet
    c[N] = cN;
    for (let k = N; k >= 1; k--) {
      const qNext = k === N ? 0 : qStar(iso, c[k + 1]!);
      c[k - 1] = c[k]! + (M / V) * (qStar(iso, c[k]!) - qNext);
    }
    return c;
  };
  let lo = 0, hi = c0;
  //  c0(c_N) rises monotonically with c_N on a rising isotherm (each term of
  //  the march does); the bracket [0, c0] holds because c0(0) = 0 and
  //  c0(c0) >= c0.  Checked rather than assumed:
  if (!(march(hi)[0]! >= c0))
    return {
      stages: [], masses: [], cOut: NaN, removal: NaN, balanceError: NaN, stageBalanceError: NaN,
      refused: "the countercurrent march did not bracket the inlet concentration",
    };
  for (let it = 0; it < 200 && hi - lo > 1e-15 * c0; it++) {
    const mid = 0.5 * (lo + hi);
    if (march(mid)[0]! < c0) lo = mid; else hi = mid;
  }
  const c = march(0.5 * (lo + hi));
  //  The stage states: the liquid leaving stage k is c[k], the solid leaving
  //  it carries q*(c[k]).  The inlet the march returns is c[0] (equal to c0
  //  to the bisection tolerance); the balances are taken on the DECLARED c0.
  const stages: Stage[] = [];
  let stageErr = 0;
  for (let k = 1; k <= N; k++) {
    const q = qStar(iso, c[k]!), qIn = k === N ? 0 : qStar(iso, c[k + 1]!);
    const cIn = k === 1 ? c0 : c[k - 1]!;
    stageErr = Math.max(stageErr, Math.abs(V * cIn + M * qIn - (V * c[k]! + M * q)) / (V * c0));
    stages.push({ c: c[k]!, q, iterations: 0 });
  }
  const cOut = c[N]!;
  const onSolid = M * stages[0]!.q;
  return {
    stages, masses: stages.map(() => M), cOut, removal: removalPct(c0, cOut),
    balanceError: Math.abs(V * c0 - (V * cOut + onSolid)) / (V * c0), stageBalanceError: stageErr,
  };
}

export interface BestSplit { fraction: number; cOut: number; removal: number; cEqual: number; removalEqual: number }

/** The fraction f of a fixed total that, put in the FIRST of two crossflow
 *  stages (1 - f in the second), leaves the least solute.  Golden-section on
 *  [0, 1]; c_out(f) is unimodal for the three isotherms here (checked by the
 *  tests on a fine grid, not assumed). */
export function bestTwoStageSplit(iso: Isotherm, V: number, M: number, c0: number): BestSplit {
  const cOf = (f: number) => crossflow(iso, V, M, c0, [f, 1 - f]).cOut;
  const g = (Math.sqrt(5) - 1) / 2;
  let a = 0, b = 1, x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = cOf(x1), f2 = cOf(x2);
  for (let it = 0; it < 200 && b - a > 1e-10; it++) {
    if (f1 <= f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = cOf(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = cOf(x2); }
  }
  const fraction = 0.5 * (a + b), cOut = cOf(fraction), cEqual = cOf(0.5);
  return { fraction, cOut, removal: removalPct(c0, cOut), cEqual, removalEqual: removalPct(c0, cEqual) };
}

// ---- how long it takes: the external film ------------------------------------------

export interface FilmInput {
  iso: Isotherm;
  /** Liquid volume, L. */
  V_L: number;
  /** Adsorbent mass, g. */
  M_g: number;
  /** Initial concentration, mg/L; the adsorbent is fresh. */
  c0: number;
  /** Particle diameter, m. */
  d_m: number;
  /** PARTICLE density (mass of a particle over its own envelope volume,
   *  pores included), kg/m3. */
  rhoP: number;
  /** Molecular diffusivity of the solute in the liquid, m2/s. */
  DAB: number;
  /** Sherwood number k_L d / D_AB; 2 is the stagnant-fluid lower bound. */
  Sh: number;
}

export interface FilmCoefficients {
  /** Film mass-transfer coefficient, m/s. */
  kL: number;
  /** External particle area per liquid volume, 1/m. */
  a: number;
  /** Their product, 1/s. */
  kLa: number;
}

/** k_L = Sh D_AB/d; a = 6 M/(rho_p d V) for spheres (M/rho_p is the volume
 *  of the particles, 6/d their area per volume). */
export function filmCoefficients(f: FilmInput): FilmCoefficients {
  const kL = (f.Sh * f.DAB) / f.d_m;
  const M_kg = f.M_g / 1000, V_m3 = f.V_L / 1000;
  const a = (6 * M_kg) / (f.rhoP * f.d_m * V_m3);
  return { kL, a, kLa: kL * a };
}

/** The right-hand side dc/dt = -k_L a (c - c*(q)), with the loading q read
 *  from the batch balance q = V (c0 - c)/M of fresh adsorbent.  The particle
 *  is uniformly loaded (no internal gradient: that is what film-only means),
 *  so its surface sits on the isotherm at its own mean loading. */
export function filmRate(f: FilmInput, kLa: number, c: number): number {
  const q = (f.V_L * (f.c0 - c)) / f.M_g;
  return -kLa * (c - cStar(f.iso, q));
}

/** For the LINEAR isotherm, the closed form.  With alpha = V/(M K) and
 *  beta = 1 + alpha, the balance makes c* = alpha (c0 - c), so
 *    dc/dt = -k_L a (beta c - alpha c0)
 *  whose solution from c(0) = c0 is
 *    c(t) = (c0/beta) [exp(-k_L a beta t) + alpha]. */
export function linearFilmC(f: FilmInput, kLa: number, t: number): number {
  const alpha = f.V_L / (f.M_g * f.iso.params[0]!), beta = 1 + alpha;
  return (f.c0 / beta) * (Math.exp(-kLa * beta * t) + alpha);
}

export interface Trajectory {
  t: number[];
  c: number[];
  /** "closed form" for linear, "RK4" otherwise -- said on the page. */
  method: "closed form" | "RK4";
  /** Equilibrium concentration the uptake tends to, mg/L. */
  cInf: number;
}

/** One classical RK4 step of dc/dt = g(c). */
function rk4(g: (c: number) => number, c: number, h: number): number {
  const k1 = g(c), k2 = g(c + 0.5 * h * k1), k3 = g(c + 0.5 * h * k2), k4 = g(c + h * k3);
  return c + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
}

/** RK4 with step doubling: a step of h is compared with two of h/2, and h
 *  is halved until they agree to `tol` (absolute, mg/L).  The accepted value
 *  is the two-half-step one.  Returns the states at `tEnd` sampled at every
 *  accepted step. */
export function integrateRK4(g: (c: number) => number, c0: number, tEnd: number, tol: number,
  h0: number): { t: number[]; c: number[] } {
  const t = [0], c = [c0];
  let tc = 0, cc = c0, h = h0;
  for (let n = 0; n < 200000 && tc < tEnd; n++) {
    h = Math.min(h, tEnd - tc);
    const big = rk4(g, cc, h), half = rk4(g, rk4(g, cc, h / 2), h / 2);
    if (Math.abs(big - half) > tol && h > 1e-12 * tEnd) { h /= 2; continue; }
    tc += h; cc = half; t.push(tc); c.push(cc);
    if (Math.abs(big - half) < tol / 32) h *= 2;
  }
  return { t, c };
}

/** The film uptake from t = 0 to tEnd, on n points for the closed form or on
 *  the integrator's own steps for RK4. */
export function filmTrajectory(f: FilmInput, tEnd: number, n = 200): Trajectory {
  const { kLa } = filmCoefficients(f);
  const cInf = stageEquilibrium(f.iso, f.V_L, f.M_g, f.c0).c;
  if (f.iso.model === "linear") {
    const t = Array.from({ length: n }, (_, k) => (tEnd * k) / (n - 1));
    return { t, c: t.map((x) => linearFilmC(f, kLa, x)), method: "closed form", cInf };
  }
  const r = integrateRK4((c) => filmRate(f, kLa, c), f.c0, tEnd, 1e-9 * f.c0, tEnd / 200);
  return { ...r, method: "RK4", cInf };
}

export interface TimeToTarget { t: number; method: "closed form" | "RK4"; refused?: string }

/** The time for c to fall to `cTarget`.  Refused, by name, when the target
 *  lies at or below the equilibrium the uptake tends to (it is never
 *  reached) or at or above c0.  Linear: t = -ln(beta c/c0 - alpha)/(k_L a beta).
 *  Otherwise RK4 until the target is crossed, the crossing step then
 *  bisected on its own length. */
export function timeToTarget(f: FilmInput, cTarget: number): TimeToTarget {
  const { kLa } = filmCoefficients(f);
  const cInf = stageEquilibrium(f.iso, f.V_L, f.M_g, f.c0).c;
  const method = f.iso.model === "linear" ? "closed form" : "RK4";
  if (!(cTarget < f.c0))
    return { t: NaN, method, refused: `the target ${cTarget.toPrecision(4)} mg/L is not below c0 = ${f.c0} mg/L` };
  if (!(cTarget > cInf * (1 + 1e-9)))
    return { t: NaN, method, refused: `the target ${cTarget.toPrecision(4)} mg/L is at or below the equilibrium `
      + `${cInf.toPrecision(4)} mg/L this dose tends to: the uptake approaches it and never reaches `
      + "it, so no time does" };
  if (f.iso.model === "linear") {
    const alpha = f.V_L / (f.M_g * f.iso.params[0]!), beta = 1 + alpha;
    return { t: -Math.log((beta * cTarget) / f.c0 - alpha) / (kLa * beta), method };
  }
  const g = (c: number) => filmRate(f, kLa, c);
  //  March in steps scaled by the initial time constant until the target is
  //  crossed; then bisect the crossing step.
  let tc = 0, cc = f.c0, h = 0.01 / kLa;
  const tol = 1e-10 * f.c0;
  for (let n = 0; n < 1000000; n++) {
    const big = rk4(g, cc, h), half = rk4(g, rk4(g, cc, h / 2), h / 2);
    if (Math.abs(big - half) > tol) { h /= 2; continue; }
    if (half <= cTarget) {
      let lo = 0, hi = h;
      for (let k = 0; k < 100 && hi - lo > 1e-14 * (tc + h); k++) {
        const mid = 0.5 * (lo + hi);
        const cm = rk4(g, rk4(g, cc, mid / 2), mid / 2);
        if (cm > cTarget) lo = mid; else hi = mid;
      }
      return { t: tc + 0.5 * (lo + hi), method };
    }
    tc += h; cc = half;
    if (Math.abs(big - half) < tol / 32) h *= 2;
  }
  return { t: NaN, method, refused: "the integration did not reach the target in a million steps" };
}

// ---- what the film model leaves out --------------------------------------------------

export interface BiotReading {
  /** Bi = k_L R / D_e. */
  Bi: number;
  /** The internal resistance over the film's, R/(5 D_e) over 1/k_L, = Bi/5,
   *  in the linear-driving-force approximation for the particle. */
  internalOverFilm: number;
  /** True when the internal resistance adds more than 10 % to the film's. */
  unreliable: boolean;
}

/** The mass-transfer Biot number of a sphere and what it implies. */
export function biot(kL: number, d_m: number, De: number): BiotReading {
  const Bi = (kL * (d_m / 2)) / De;
  return { Bi, internalOverFilm: Bi / 5, unreliable: Bi / 5 > 0.1 };
}

// ---- the example systems ----------------------------------------------------------------

export interface ExampleSystem {
  id: string;
  label: string;
  story: string;
  iso: Isotherm;
}

/** Illustrative isotherms with this page's own numbers (mg/L, mg/g) -- of the
 *  kinds met in coursework, not data from any source. */
export const EXAMPLES: readonly ExampleSystem[] = [
  {
    id: "dye-carbon", label: "Dye on powdered activated carbon (Langmuir, this page's numbers)",
    story: "A strongly favourable isotherm with a clear capacity, the shape of a dye taken up by "
      + "a powdered carbon.",
    iso: { model: "langmuir", params: [200, 4] },
  },
  {
    id: "phenol-carbon", label: "Aromatic solute on granular carbon (Freundlich, this page's numbers)",
    story: "A power law with no plateau over the range of interest, the shape usually reported "
      + "for an aromatic solute on a granular carbon.",
    iso: { model: "freundlich", params: [30, 0.3] },
  },
  {
    id: "trace-resin", label: "Trace solute, linear region (linear, this page's numbers)",
    story: "A dilute solute far below any capacity limit: loading proportional to concentration.",
    iso: { model: "linear", params: [5] },
  },
];
