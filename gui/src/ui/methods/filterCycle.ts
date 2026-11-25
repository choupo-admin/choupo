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
  filterCycle -- the arithmetic of "When do I open the press?" (C511).

  THE ENGINE OWNS THE PHYSICS.  CakeFilter (src/unitOperations/solids/
  CakeFilter.cpp) computes, for a plate-and-frame press (model batchPress):
      K_p = mu alpha c_S / (A^2 dp)            line 336 (Geankoplis eq. 24.2-14)
      B   = mu R_m / (A dp)                    line 337 (eq. 24.2-15)
      t_f = K_p V^2 / 2 + B V                  line 338 (eq. 24.2-17)
      t_w = V_w / (f / (K_p V + B))            lines 371-373 (eqs. 24.2-19/-20)
      t_c = t_f + t_w + t_d                    line 405
  and publishes K_p, B, V, t_f, t_w, t_d, t_c and the two flows as KPIs.

  WHAT THIS FILE ADDS is algebra on those lines and nothing the engine does
  not do: the same three times as functions of V, the average rate V / t_c
  over a whole cycle, and its maximum in closed form.  The wash enters
  exactly as the engine writes it: the wash volume per cycle scales with V (a
  fixed fraction w of the filtrate, line 372) and it is pushed at f / (K_p V
  + B), so t_w = (w/f) V (K_p V + B) -- a V^2 term and a V term like the
  filtration's own.  Both fold into a quadratic t_c = a V^2 + b V + t_d with
      a = (1/2 + w/f) K_p        b = (1 + w/f) B,
  and dR/dV = 0 gives a V*^2 = t_d.  The page's curve is held to the
  engine's own runs: live dots on the page, and filterCycle.test.ts.

  Pure and dependency-free, so the node test runner imports it.
\*---------------------------------------------------------------------------*/

/** The engine numbers the cycle is built from (the KPIs of one run). */
export interface PressFacts {
  /** K_p, s/m^6 (kpi Kp_s_m6). */
  Kp: number;
  /** B, s/m^3 (kpi B_s_m3). */
  B: number;
  /** w / f: the wash volume as a fraction of the filtrate, divided by the
   *  wash flow's share of the final filtration rate.  0 means no washing. */
  washOverFactor: number;
}

/** t_f(V) = K_p V^2 / 2 + B V, s (eq. 24.2-17). */
export const filtrationTime = (p: PressFacts, V: number): number =>
  0.5 * p.Kp * V * V + p.B * V;

/** t_w(V) = (w/f) V (K_p V + B), s (eqs. 24.2-19/-20 as CakeFilter writes them). */
export const washTime = (p: PressFacts, V: number): number =>
  p.washOverFactor * V * (p.Kp * V + p.B);

/** The cycle, s: filtration + washing + the dead time t_d. */
export const cycleTime = (p: PressFacts, V: number, tDead: number): number =>
  filtrationTime(p, V) + washTime(p, V) + tDead;

/** The average rate over the whole cycle, m^3/s. */
export const averageRate = (p: PressFacts, V: number, tDead: number): number =>
  V > 0 ? V / cycleTime(p, V, tDead) : 0;

/** t_c = a V^2 + b V + t_d: the two coefficients. */
export const quadratic = (p: PressFacts): { a: number; b: number } => ({
  a: (0.5 + p.washOverFactor) * p.Kp,
  b: (1 + p.washOverFactor) * p.B,
});

export interface Optimum {
  /** V*, m^3 per cycle. */
  V: number;
  /** The average rate there, m^3/s. */
  rate: number;
  /** The filtration time at V*, s. */
  tFilt: number;
  /** The washing time at V*, s. */
  tWash: number;
  /** a V*^2, s: the time in the V^2 terms, which equals t_d at the optimum. */
  quadraticTime: number;
  /** beta = b / (a V*): the one number that sets how flat the optimum is. */
  beta: number;
}

/** The maximum of V / t_c: a V*^2 = t_d and rate* = 1 / (2 a V* + b). */
export function optimum(p: PressFacts, tDead: number): Optimum {
  const { a, b } = quadratic(p);
  const V = Math.sqrt(tDead / a);
  return {
    V, rate: 1 / (2 * a * V + b),
    tFilt: filtrationTime(p, V), tWash: washTime(p, V),
    quadraticTime: a * V * V, beta: b / (a * V),
  };
}

/** R(V) / R* as a function of x = V / V*: (2 + beta) x / (x^2 + 1 + beta x).
 *  It is unchanged by x -> 1/x: opening early by a factor k and late by the
 *  same factor lose the same share of the rate. */
export const rateRatio = (beta: number, x: number): number =>
  x > 0 ? ((2 + beta) * x) / (x * x + 1 + beta * x) : 0;

/** The two volumes where the rate is `share` of its maximum (share in (0, 1)):
 *  the roots of a V^2 + (b - 1/(share R*)) V + t_d = 0. */
export function band(p: PressFacts, tDead: number, share: number): { lo: number; hi: number } {
  const { a, b } = quadratic(p);
  const o = optimum(p, tDead);
  const c = b - 1 / (share * o.rate);
  const disc = Math.sqrt(Math.max(0, c * c - 4 * a * tDead));
  return { lo: (-c - disc) / (2 * a), hi: (-c + disc) / (2 * a) };
}

/** The presses needed to pass a filtrate flow Q_f: Q_f t_c / V (CakeFilter.cpp:406). */
export const pressesFor = (Qf: number, V: number, tc: number): number => (Qf * tc) / V;

/** What a run's KPI block gives, as the facts above.  `washOverFactor` is
 *  read from the run's own wash time: t_w = (w/f) V (K_p V + B), so
 *  w/f = t_w / (V (K_p V + B)).  Null when a number is missing. */
export function factsFromKpis(
  k: { [key: string]: number } | undefined,
): { facts: PressFacts; V: number; tDead: number; Qf: number; tc: number } | null {
  if (!k) return null;
  const need = ["Kp_s_m6", "B_s_m3", "filtratePerCycle_m3", "cleaningTime_s", "cycleTime_s", "filtrate_m3_s"];
  for (const key of need) if (typeof k[key] !== "number" || !Number.isFinite(k[key])) return null;
  const V = k["filtratePerCycle_m3"]!, Kp = k["Kp_s_m6"]!, B = k["B_s_m3"]!;
  const tw = k["washTime_s"];
  const washOverFactor = typeof tw === "number" && Number.isFinite(tw)
    ? tw / (V * (Kp * V + B)) : 0;
  return {
    facts: { Kp, B, washOverFactor }, V, tDead: k["cleaningTime_s"]!,
    Qf: k["filtrate_m3_s"]!, tc: k["cycleTime_s"]!,
  };
}
