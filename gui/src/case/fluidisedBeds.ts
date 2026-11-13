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
  fluidisedBeds — the arithmetic of the `fluidised-beds` EduTool: a bed of
  particles and a gas blown up through it.  At what velocity does it
  fluidise, what regime will it be in, how much does it expand, and how much
  gas bypasses the particles?

  WHY THIS IS THE PAGE'S OWN ARITHMETIC (measured 2026-11-12,
  docs/design/fluidised-bed-hydrodynamics.md): Choupo's engine has NO
  fluidised bed -- no minimum fluidisation velocity, no bed expansion, no
  bubble model.  What it has is Ergun's fixed-bed pressure drop
  (`PFR::ergunTerms`, src/unitOperations/reactor/PFR.cpp), the single-particle
  terminal velocity of the pneumatic conveyor on the Schiller-Naumann drag
  law (src/unitOperations/hydraulics/PneumaticConveyor.cpp), and the cyclone.
  This file writes those two laws again in the SAME form, so a student who
  later reads the engine meets the arithmetic of this page, and adds what the
  engine does not have.  Every number on the page is computed here.

  The gas is DECLARED: its density from the ideal-gas law at the T, P and
  molar mass the student types, its viscosity typed.  The engine's property
  package could supply both, but only through a run per change of T or P;
  the page keeps the declared route and marks it an assumption.

  Every constant below that comes from a published correlation is listed in
  the design record's "To check against the source" table with the status
  `unchecked`: it was written from the published form as remembered, and
  nobody has yet read it back against the paper.

  Units: SI throughout (m, s, kg, Pa), except where a correlation was
  published in other units (Mori-Wen in centimetres and seconds, the
  Geldart map in micrometres and g/cm3); those convert at their own door.
\*---------------------------------------------------------------------------*/

/** Standard gravity, m/s2. */
export const G = 9.80665;
/** Molar gas constant, J/(mol K). */
export const R_GAS = 8.314462618;

export interface Particle {
  /** diameter, m (a sphere) */
  d: number;
  /** particle density, kg/m3 (pores included) */
  rhoP: number;
}

export interface Gas {
  /** density, kg/m3 */
  rhoG: number;
  /** dynamic viscosity, Pa s */
  mu: number;
}

/** Ideal-gas density, kg/m3, from M in g/mol, T in K and P in Pa. */
export const idealGasDensity = (M_gmol: number, T_K: number, P_Pa: number): number =>
  (P_Pa * M_gmol * 1e-3) / (R_GAS * T_K);

/** Archimedes number g d3 rho_g (rho_p - rho_g) / mu2. */
export function archimedes(p: Particle, gas: Gas): number {
  return (G * p.d ** 3 * gas.rhoG * (p.rhoP - gas.rhoG)) / (gas.mu * gas.mu);
}

/** Particle Reynolds number at a velocity u. */
export const reynolds = (u: number, p: Particle, gas: Gas): number => (gas.rhoG * u * p.d) / gas.mu;

/** A plain refusal for inputs no formula on the page can take. */
export function inputRefusal(p: Particle, gas: Gas, eps: number): string | null {
  if (!(p.d > 0)) return "the particle diameter must be positive";
  if (!(gas.rhoG > 0)) return "the gas density must be positive";
  if (!(gas.mu > 0)) return "the gas viscosity must be positive";
  if (!(p.rhoP > gas.rhoG)) return "the particle must be denser than the gas, or it never settles and the bed never forms";
  if (!(eps > 0 && eps < 1)) return "the voidage must lie strictly between 0 and 1";
  return null;
}

// ---- Ergun, and the weight line --------------------------------------------------

export interface ErgunTerms {
  /** the viscous term, Pa/m */
  viscous: number;
  /** the inertial term, Pa/m */
  inertial: number;
  /** their sum, Pa/m */
  total: number;
}

/** Ergun's pressure gradient through a packed bed of spheres at superficial
 *  velocity u: the same two terms, written the same way, as
 *  `PFR::ergunTerms` (src/unitOperations/reactor/PFR.cpp). */
export function ergunGradient(u: number, d: number, eps: number, gas: Gas): ErgunTerms {
  const a = (150 * (1 - eps) * (1 - eps) * gas.mu) / (eps * eps * eps * d * d);
  const b = (1.75 * (1 - eps) * gas.rhoG) / (eps * eps * eps * d);
  const viscous = a * u, inertial = b * u * u;
  return { viscous, inertial, total: viscous + inertial };
}

/** The bed's weight per unit volume, net of buoyancy: what the gas must
 *  carry once the bed is fluidised, Pa per metre of bed at voidage eps. */
export const weightGradient = (eps: number, p: Particle, gas: Gas): number =>
  (1 - eps) * (p.rhoP - gas.rhoG) * G;

// ---- a bracketed root -------------------------------------------------------------

export interface Root {
  x: number;
  iterations: number;
  bracket: readonly [number, number];
}

/** Bisection on a bracket [lo, hi] with f(lo) < 0 < f(hi), halved until the
 *  bracket is below `relTol` of its upper end.  It cannot fail to close. */
export function bisect(f: (x: number) => number, lo: number, hi: number,
  relTol = 1e-15, maxIt = 400): Root {
  const bracket = [lo, hi] as const;
  let it = 0;
  while (hi - lo > relTol * Math.abs(hi) && it < maxIt) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) < 0) lo = mid; else hi = mid;
    it++;
  }
  return { x: 0.5 * (lo + hi), iterations: it, bracket };
}

/** Grow an upper bound from `start` by doubling until f is positive. */
function growUpper(f: (x: number) => number, start: number): number {
  let hi = start;
  for (let k = 0; k < 200 && !(f(hi) > 0); k++) hi *= 2;
  return hi;
}

// ---- minimum fluidisation ----------------------------------------------------------

export interface MinFluid {
  /** u_mf, m/s: where Ergun meets the weight line, by bisection */
  u: number;
  iterations: number;
  bracket: readonly [number, number];
  /** the same root from the quadratic formula, m/s */
  uClosed: number;
  /** Re_mf at u */
  re: number;
  /** Wen and Yu's estimate, m/s, and its Re_mf */
  wenYu: { u: number; re: number };
  /** (Wen-Yu - Ergun)/Ergun, % */
  diffPct: number;
  /** the weight per area the gas carries at and after u_mf, Pa per m of bed */
  weight: number;
}

/** Wen and Yu's two constants (Re_mf = sqrt(C1^2 + C2 Ar) - C1).  UNCHECKED
 *  against the paper: see the design record's source table. */
export const WEN_YU = { C1: 33.7, C2: 0.0408 } as const;

export function wenYu(p: Particle, gas: Gas): { u: number; re: number } {
  const re = Math.sqrt(WEN_YU.C1 * WEN_YU.C1 + WEN_YU.C2 * archimedes(p, gas)) - WEN_YU.C1;
  return { u: (re * gas.mu) / (gas.rhoG * p.d), re };
}

export function minimumFluidisation(p: Particle, gas: Gas, epsMf: number): MinFluid {
  const W = weightGradient(epsMf, p, gas);
  const f = (u: number): number => ergunGradient(u, p.d, epsMf, gas).total - W;
  const hi = growUpper(f, 1e-6);
  const r = bisect(f, 0, hi);
  //  The quadratic a u + b u^2 = W, solved the way that does not cancel.
  const t1 = ergunGradient(1, p.d, epsMf, gas);
  const a = t1.viscous, b = t1.inertial;
  const uClosed = (2 * W) / (a + Math.sqrt(a * a + 4 * b * W));
  const wy = wenYu(p, gas);
  return {
    u: r.x, iterations: r.iterations, bracket: r.bracket, uClosed,
    re: reynolds(r.x, p, gas), wenYu: wy, diffPct: (100 * (wy.u - r.x)) / r.x, weight: W,
  };
}

/** The pressure drop across the whole bed at a superficial velocity u:
 *  Ergun through the packed bed (height L_mf, voidage eps_mf) below u_mf,
 *  the bed's weight per area above it.  Pa. */
export function bedPressureDrop(u: number, p: Particle, gas: Gas, epsMf: number, Lmf: number,
  umf: number): number {
  if (u <= umf) return Lmf * ergunGradient(u, p.d, epsMf, gas).total;
  return Lmf * weightGradient(epsMf, p, gas);
}

// ---- Geldart's groups ----------------------------------------------------------------

export type GeldartGroup = "A" | "B" | "C" | "D";

/** THE PAGE'S STRAIGHT-LINE APPROXIMATION of the published map, on log axes
 *  of d in micrometres and (rho_p - rho_g) in g/cm3.  Each line is a power
 *  law: C/A  drho d^2 = 1600 (the published C/A boundary is a band, not a
 *  line);  A/B  drho d = 225;  B/D  drho d^2 = 1e6.  Every one of the three
 *  numbers is UNCHECKED against the 1973 paper (design record, source
 *  table); the figure is not traced. */
export const GELDART_LINES = {
  CA: { power: 2, value: 1600 },
  AB: { power: 1, value: 225 },
  BD: { power: 2, value: 1e6 },
} as const;

export type GeldartLine = keyof typeof GELDART_LINES;

/** The diameter on a boundary line at a density difference, micrometres. */
export function geldartBoundaryD(line: GeldartLine, drho_gcc: number): number {
  const L = GELDART_LINES[line];
  return Math.pow(L.value / drho_gcc, 1 / L.power);
}

export function geldartGroup(d_um: number, drho_gcc: number): GeldartGroup {
  if (drho_gcc * d_um * d_um < GELDART_LINES.CA.value) return "C";
  if (drho_gcc * d_um < GELDART_LINES.AB.value) return "A";
  if (drho_gcc * d_um * d_um < GELDART_LINES.BD.value) return "B";
  return "D";
}

export const GELDART_SAYS: Readonly<Record<GeldartGroup, string>> = {
  C: "Cohesive: the particles stick to each other, the gas opens channels through the powder and the bed lifts as a plug instead of fluidising.",
  A: "Aeratable: the bed first expands smoothly with no bubbles, then bubbles; it holds air and collapses slowly when the gas is cut.",
  B: "Sand-like: bubbles appear as soon as the bed fluidises and grow as they rise.",
  D: "Coarse or dense: large, slow bubbles; the gas can punch a jet through the bed and spout it.",
};

// ---- the velocities that bound the regimes -------------------------------------------

/** Abrahamsen and Geldart's minimum bubbling velocity, m/s, for a group A
 *  powder with a mass fraction F of fines (below 45 micrometres):
 *  u_mb = 2.07 exp(0.716 F) d rho_g^0.06 / mu^0.347, in SI.  EMPIRICAL and
 *  dimensional; UNCHECKED against the paper (design record). */
export function minimumBubbling(p: Particle, gas: Gas, fines: number): number {
  return (2.07 * Math.exp(0.716 * fines) * p.d * Math.pow(gas.rhoG, 0.06)) / Math.pow(gas.mu, 0.347);
}

/** Schiller-Naumann's drag coefficient for a sphere, the same law, the same
 *  switch to 0.44 at Re = 1000, as the engine's pneumatic conveyor
 *  (`dragCoeff`, src/unitOperations/hydraulics/PneumaticConveyor.cpp). */
export function dragCoefficient(Re: number): number {
  if (Re <= 0) return Infinity;
  if (Re < 1000) return (24 / Re) * (1 + 0.15 * Math.pow(Re, 0.687));
  return 0.44;
}

export type DragRegime = "Stokes" | "intermediate" | "Newton" | "beyond Newton";

/** Where the drag law sits at a particle Reynolds number.  Stokes below 0.3,
 *  Newton from 1000 (where the law above becomes a constant) to 2e5 (the
 *  drag crisis, beyond which no law on this page holds).  The two outer
 *  limits are textbook conventions, UNCHECKED here. */
export function dragRegime(Re: number): DragRegime {
  if (Re < 0.3) return "Stokes";
  if (Re < 1000) return "intermediate";
  if (Re <= 2e5) return "Newton";
  return "beyond Newton";
}

export interface Terminal {
  /** u_t, m/s */
  u: number;
  Re: number;
  Cd: number;
  regime: DragRegime;
  iterations: number;
  /** Stokes' law at the same particle, m/s, for comparison */
  uStokes: number;
  /** |drag - net weight| / net weight at the root */
  balanceResidual: number;
}

/** The terminal velocity of one sphere, by BISECTION on Re of the drag
 *  balance written without u:  Cd(Re) Re^2 = (4/3) Ar.  Cd Re^2 rises
 *  monotonically with Re for this law, so the bracket [0, Re_hi] holds one
 *  root.  (The engine iterates the same balance by substitution from Stokes'
 *  velocity; the page brackets it, so it cannot fail to close.) */
export function terminalVelocity(p: Particle, gas: Gas): Terminal {
  const Ar = archimedes(p, gas);
  const h = (Re: number): number => (Re <= 0 ? -(4 / 3) * Ar : dragCoefficient(Re) * Re * Re - (4 / 3) * Ar);
  const hi = growUpper(h, 1e-8);
  const r = bisect(h, 0, hi);
  const Re = r.x;
  const u = (Re * gas.mu) / (gas.rhoG * p.d);
  const Cd = dragCoefficient(Re);
  const drag = 0.5 * gas.rhoG * u * u * Cd * (Math.PI / 4) * p.d * p.d;
  const net = (Math.PI / 6) * p.d ** 3 * (p.rhoP - gas.rhoG) * G;
  return {
    u, Re, Cd, regime: dragRegime(Re), iterations: r.iterations,
    uStokes: (G * p.d * p.d * (p.rhoP - gas.rhoG)) / (18 * gas.mu),
    balanceResidual: Math.abs(drag - net) / net,
  };
}

/** Bi and Grace's onsets, as Reynolds numbers in Ar: the turbulent regime
 *  Re_c = 1.24 Ar^0.45 and significant entrainment (transport) Re_se =
 *  1.53 Ar^0.5.  Both constants and the Ar range below are UNCHECKED. */
export const BI_GRACE = { c: { k: 1.24, n: 0.45 }, se: { k: 1.53, n: 0.5 }, ArMin: 2, ArMax: 1e8 } as const;

export function biGrace(p: Particle, gas: Gas): { uc: number; use: number; inRange: boolean } {
  const Ar = archimedes(p, gas);
  const toU = (Re: number): number => (Re * gas.mu) / (gas.rhoG * p.d);
  return {
    uc: toU(BI_GRACE.c.k * Math.pow(Ar, BI_GRACE.c.n)),
    use: toU(BI_GRACE.se.k * Math.pow(Ar, BI_GRACE.se.n)),
    inRange: Ar >= BI_GRACE.ArMin && Ar <= BI_GRACE.ArMax,
  };
}

export type FlowRegime =
  | "fixed bed" | "particulate (no bubbles)" | "bubbling" | "turbulent"
  | "fast fluidisation or pneumatic transport";

export interface RegimeBand { regime: FlowRegime; from: number; to: number }

export interface RegimeMap {
  umf: number;
  /** u_mb where it applies (group A), else u_mf */
  umb: number;
  ut: number;
  uc: number;
  use: number;
  bands: RegimeBand[];
  /** the regime at the operating velocity */
  at: FlowRegime;
  /** u / u_mf */
  ratio: number;
  biGraceInRange: boolean;
}

export function regimeMap(p: Particle, gas: Gas, epsMf: number, fines: number, u: number): RegimeMap {
  const mf = minimumFluidisation(p, gas, epsMf);
  const group = geldartGroup(p.d * 1e6, (p.rhoP - gas.rhoG) / 1000);
  const umbRaw = group === "A" ? minimumBubbling(p, gas, fines) : mf.u;
  const umb = Math.max(umbRaw, mf.u);
  const bg = biGrace(p, gas);
  const ut = terminalVelocity(p, gas).u;
  const uc = Math.max(bg.uc, umb);
  const use = Math.max(bg.use, uc);
  const bands: RegimeBand[] = [{ regime: "fixed bed", from: 0, to: mf.u }];
  if (umb > mf.u) bands.push({ regime: "particulate (no bubbles)", from: mf.u, to: umb });
  bands.push({ regime: "bubbling", from: umb, to: uc });
  bands.push({ regime: "turbulent", from: uc, to: use });
  bands.push({ regime: "fast fluidisation or pneumatic transport", from: use, to: Infinity });
  const at = bands.find((b) => u >= b.from && u < b.to)?.regime ?? "fast fluidisation or pneumatic transport";
  return { umf: mf.u, umb, ut, uc, use, bands, at, ratio: u / mf.u, biGraceInRange: bg.inRange };
}

// ---- bubbles: the two-phase picture ---------------------------------------------------

export interface BubbleInput {
  /** superficial velocity, m/s */
  u: number;
  /** minimum fluidisation velocity, m/s */
  umf: number;
  /** voidage at minimum fluidisation */
  epsMf: number;
  /** bed height at minimum fluidisation, m */
  Lmf: number;
  /** bed (column) diameter, m */
  Dt: number;
  /** orifices of the distributor plate per m2 of bed cross-section */
  orificesPerM2: number;
  /** molecular diffusivity of the gas, m2/s */
  Dg: number;
  /** particle diameter, m (only to test Mori-Wen's stated range) */
  d: number;
}

/** Mori and Wen's bubble diameter at a height h above a perforated plate.
 *  Published in centimetres and seconds; converted here at the door.
 *  d_bm = 0.652 [A_t (u - u_mf)]^0.4, d_b0 = 0.347 [A_t (u - u_mf)/n_d]^0.4,
 *  d_b = d_bm - (d_bm - d_b0) exp(-0.3 h/D_t).  All three constants
 *  UNCHECKED (design record).  Returns metres. */
export function moriWenDiameter(h: number, b: BubbleInput): { db: number; db0: number; dbm: number } {
  const A_cm2 = (Math.PI / 4) * (b.Dt * 100) ** 2;
  const du = (b.u - b.umf) * 100;
  const nd = b.orificesPerM2 * (Math.PI / 4) * b.Dt * b.Dt;
  const dbm = 0.652 * Math.pow(A_cm2 * du, 0.4);
  const db0 = 0.347 * Math.pow((A_cm2 * du) / nd, 0.4);
  const db = dbm - (dbm - db0) * Math.exp((-0.3 * h) / b.Dt);
  return { db: db / 100, db0: db0 / 100, dbm: dbm / 100 };
}

/** The ranges Mori and Wen state for their correlation, as remembered:
 *  UNCHECKED.  Each entry is a reason the page flags, never clips. */
export function moriWenOutside(b: BubbleInput): string[] {
  const out: string[] = [];
  if (b.Dt < 0.3 || b.Dt > 1.3) out.push(`the bed diameter ${b.Dt} m is outside 0.3-1.3 m`);
  if (b.umf < 0.005 || b.umf > 0.2) out.push(`u_mf = ${(b.umf * 100).toPrecision(3)} cm/s is outside 0.5-20 cm/s`);
  if (b.d < 60e-6 || b.d > 450e-6) out.push(`the particle diameter ${(b.d * 1e6).toPrecision(3)} µm is outside 60-450 µm`);
  if (b.u - b.umf > 0.48) out.push(`u - u_mf = ${((b.u - b.umf) * 100).toPrecision(3)} cm/s is above 48 cm/s`);
  return out;
}

/** Rise velocity of a single bubble, 0.711 sqrt(g d_b) (Davidson and
 *  Harrison's constant; UNCHECKED), m/s. */
export const singleBubbleRise = (db: number): number => 0.711 * Math.sqrt(G * db);

/** Kunii and Levenspiel's bubble-to-cloud interchange coefficient, 1/s,
 *  4.5 u_mf/d_b + 5.85 D^0.5 g^0.25 / d_b^1.25, published in cgs units and
 *  evaluated in them here.  Constants UNCHECKED. */
export function interchangeKbc(umf: number, db: number, Dg: number): number {
  const umf_cm = umf * 100, db_cm = db * 100, D_cm2 = Dg * 1e4, g_cm = G * 100;
  return (4.5 * umf_cm) / db_cm + (5.85 * Math.sqrt(D_cm2) * Math.pow(g_cm, 0.25)) / Math.pow(db_cm, 1.25);
}

export interface BubblePoint {
  /** height above the distributor, m */
  h: number;
  db: number;
  ubr: number;
  ub: number;
  /** bubble fraction of the bed, (u - u_mf)/u_b */
  delta: number;
  Kbc: number;
  /** cloud volume over bubble volume (Davidson), Infinity for a slow bubble */
  cloudRatio: number;
}

export function bubbleAt(h: number, b: BubbleInput, growth: boolean): BubblePoint {
  const mw = moriWenDiameter(h, b);
  const db = growth ? mw.db : mw.db0;
  const ubr = singleBubbleRise(db);
  const ub = b.u - b.umf + ubr;
  const uf = b.umf / b.epsMf;
  return {
    h, db, ubr, ub, delta: (b.u - b.umf) / ub,
    Kbc: interchangeKbc(b.umf, db, b.Dg),
    cloudRatio: ubr > uf ? (3 * uf) / (ubr - uf) : Infinity,
  };
}

export interface BubbleBed {
  /** expanded bed height, m */
  H: number;
  /** H / L_mf */
  expansion: number;
  /** mean bubble fraction over the expanded bed */
  deltaMean: number;
  /** fraction of the gas that enters as bubbles, (u - u_mf)/u */
  bubbleGasFraction: number;
  /** fraction of the bubble gas that reaches the top without passing into the cloud */
  unexchanged: number;
  /** fraction of ALL the gas that crosses the bed without contacting the emulsion */
  bypass: number;
  /** the profile, for the plot */
  profile: BubblePoint[];
  iterations: number;
}

/** The two-phase bed: the excess gas u - u_mf rises as bubbles (the simple
 *  two-phase form, UNCHECKED as to which variant the sources prefer); the
 *  expanded height from the mean bubble fraction, by fixed point on H; the
 *  bubble gas exchanged into the cloud along the height,
 *  d(ln Y)/dh = -K_bc/u_b, integrated by the trapezoid rule on n steps.
 *  `growth = false` freezes every bubble at its size at the distributor. */
export function bubbleBed(b: BubbleInput, growth: boolean, n = 400): BubbleBed | null {
  if (!(b.u > b.umf)) return null;
  const meanOver = (H: number, f: (pt: BubblePoint) => number): number => {
    let s = 0;
    for (let k = 0; k <= n; k++) {
      const w = k === 0 || k === n ? 0.5 : 1;
      s += w * f(bubbleAt((H * k) / n, b, growth));
    }
    return s / n;
  };
  let H = b.Lmf, it = 0;
  for (; it < 200; it++) {
    const dm = meanOver(H, (pt) => pt.delta);
    const Hn = b.Lmf / (1 - dm);
    const done = Math.abs(Hn - H) <= 1e-13 * Hn;
    H = Hn;
    if (done) break;
  }
  const deltaMean = meanOver(H, (pt) => pt.delta);
  const integral = H * meanOver(H, (pt) => pt.Kbc / pt.ub);
  const unexchanged = Math.exp(-integral);
  const bubbleGasFraction = (b.u - b.umf) / b.u;
  const profile = Array.from({ length: 41 }, (_, k) => bubbleAt((H * k) / 40, b, growth));
  return {
    H, expansion: H / b.Lmf, deltaMean, bubbleGasFraction, unexchanged,
    bypass: bubbleGasFraction * unexchanged, profile, iterations: it + 1,
  };
}

// ---- elutriation, size by size ---------------------------------------------------------

export interface SizeClass { d_um: number; massPct: number }

export const DEFAULT_CLASSES: readonly SizeClass[] = [
  { d_um: 20, massPct: 2 }, { d_um: 40, massPct: 4 }, { d_um: 60, massPct: 8 },
  { d_um: 90, massPct: 16 }, { d_um: 125, massPct: 25 }, { d_um: 180, massPct: 25 },
  { d_um: 250, massPct: 15 }, { d_um: 355, massPct: 5 },
];

export interface ElutriationRow extends SizeClass { ut: number; Re: number; leaves: boolean }

export function elutriationTable(classes: readonly SizeClass[], rhoP: number, gas: Gas, u: number):
  { rows: ElutriationRow[]; leavingPct: number; totalPct: number } {
  const rows = classes.map((c): ElutriationRow => {
    const t = terminalVelocity({ d: c.d_um * 1e-6, rhoP }, gas);
    return { ...c, ut: t.u, Re: t.Re, leaves: u > t.u };
  });
  const totalPct = classes.reduce((s, c) => s + c.massPct, 0);
  const leavingPct = rows.filter((r) => r.leaves).reduce((s, r) => s + r.massPct, 0);
  return { rows, leavingPct, totalPct };
}

/** The largest diameter the gas can carry out at velocity u (u_t = u), m,
 *  by bisection on d.  NaN when u <= 0. */
export function cutDiameter(rhoP: number, gas: Gas, u: number): number {
  if (!(u > 0)) return NaN;
  const f = (d: number): number => terminalVelocity({ d, rhoP }, gas).u - u;
  const hi = growUpper(f, 1e-7);
  return bisect(f, 0, hi, 1e-12).x;
}
