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
  stackDispersionMath -- the arithmetic of the `stack-dispersion` EduTool
  (DEV.md 4c C247): how tall a stack must be so that the gas it emits reaches
  the ground diluted enough.  PURE FUNCTIONS, no React, no engine: the
  dispersion is the TOOL's arithmetic (the pool-fire precedent), and the one
  thing the engine supplies -- the flue gas of a Gibbs reactor -- enters
  through `emissionFromStream`, which only converts units.

  WHAT WAS READ AND WHAT WAS NOT (said again on the page, in STACK_SOURCES and
  STACK_LIMITS).  Per coefficient set, `verified` says whether the writer of
  this file could read a source that prints it:
    * URBAN sigma set (Briggs 1973, McElroy-Pooler): read in a published
      table of Briggs' curves (a conference presentation on an urban
      application) -- a SECONDARY copy, not Hanna, Briggs & Hosker.
    * RURAL sigma set, the Turner class table, Briggs' plume-rise constants
      (21.425, 38.71, 2.6) and the stable-air default gradients: written
      from the standard tabulation; NO source that prints them could be read
      for this page.  They are flagged `unread` and the page says so.
    * Good engineering practice height H + 1.5 L and its 65 m clause: read in
      40 CFR 51.100(ii) (eCFR).
\*---------------------------------------------------------------------------*/

export type StabilityClass = "A" | "B" | "C" | "D" | "E" | "F";
export const CLASSES: readonly StabilityClass[] = ["A", "B", "C", "D", "E", "F"];
export type Terrain = "rural" | "urban";
export type Verified = "read" | "unread";

export const G = 9.80665; // m/s2, standard gravity

// ---- 1. the Gaussian plume ---------------------------------------------------

/** C(x,y,z) of a continuous point source of strength Q [mass/s] at effective
 *  height H, wind u, with sigma_y, sigma_z already evaluated at x.  The two
 *  z-exponentials are the source and its IMAGE (derivation in the lesson):
 *  the ground returns the plume, it does not absorb it. */
export function plumeConcentration(
  Q: number, u: number, sy: number, sz: number, H: number, y: number, z: number,
): number {
  const lateral = Math.exp(-(y * y) / (2 * sy * sy));
  const vertical = Math.exp(-((z - H) ** 2) / (2 * sz * sz))
                 + Math.exp(-((z + H) ** 2) / (2 * sz * sz));
  return (Q / (2 * Math.PI * u * sy * sz)) * lateral * vertical;
}

/** Ground-level centreline: the two exponentials are equal at z = 0. */
export function groundCentreline(
  Q: number, u: number, sy: number, sz: number, H: number,
): number {
  return (Q / (Math.PI * u * sy * sz)) * Math.exp(-(H * H) / (2 * sz * sz));
}

// ---- 3. Briggs' sigma curves -------------------------------------------------

/** sigma = i x (1 + a x)^b, x in metres. */
export interface SigmaFit { i: number; a: number; b: number }

export interface SigmaSet {
  terrain: Terrain;
  source: string;
  verified: Verified;
  y: Record<StabilityClass, SigmaFit>;
  z: Record<StabilityClass, SigmaFit>;
}

const fit = (i: number, a: number, b: number): SigmaFit => ({ i, a, b });

export const SIGMA_SETS: Record<Terrain, SigmaSet> = {
  rural: {
    terrain: "rural", verified: "unread",
    source: "Briggs 1973 open-country fits, as tabulated by Hanna, Briggs & "
      + "Hosker 1982 (DOE/TIC-11223) -- written from the standard tabulation, "
      + "not read for this page",
    y: {
      A: fit(0.22, 0.0001, -0.5), B: fit(0.16, 0.0001, -0.5),
      C: fit(0.11, 0.0001, -0.5), D: fit(0.08, 0.0001, -0.5),
      E: fit(0.06, 0.0001, -0.5), F: fit(0.04, 0.0001, -0.5),
    },
    z: {
      A: fit(0.20, 0, 0), B: fit(0.12, 0, 0),
      C: fit(0.08, 0.0002, -0.5), D: fit(0.06, 0.0015, -0.5),
      E: fit(0.03, 0.0003, -1), F: fit(0.016, 0.0003, -1),
    },
  },
  urban: {
    terrain: "urban", verified: "read",
    source: "Briggs 1973 urban fits (McElroy-Pooler), read in a published "
      + "table of Briggs' curves (HARMO-10 presentation, an urban application) "
      + "-- a secondary copy; Hanna, Briggs & Hosker was not read",
    y: {
      A: fit(0.32, 0.0004, -0.5), B: fit(0.32, 0.0004, -0.5),
      C: fit(0.22, 0.0004, -0.5), D: fit(0.16, 0.0004, -0.5),
      E: fit(0.11, 0.0004, -0.5), F: fit(0.11, 0.0004, -0.5),
    },
    z: {
      A: fit(0.24, 0.001, 0.5), B: fit(0.24, 0.001, 0.5),
      C: fit(0.20, 0, 0), D: fit(0.14, 0.0003, -0.5),
      E: fit(0.08, 0.0015, -0.5), F: fit(0.08, 0.0015, -0.5),
    },
  },
};

export const evalFit = (f: SigmaFit, x: number): number =>
  f.i * x * Math.pow(1 + f.a * x, f.b);
export const sigmaY = (x: number, c: StabilityClass, t: Terrain): number =>
  evalFit(SIGMA_SETS[t].y[c], x);
export const sigmaZ = (x: number, c: StabilityClass, t: Terrain): number =>
  evalFit(SIGMA_SETS[t].z[c], x);

/** The window the fits were made for: about 100 m to 10 km. */
export const WINDOW_M: readonly [number, number] = [100, 10000];

// ---- 2. Turner's key to the stability categories ------------------------------

export type Insolation = "strong" | "moderate" | "slight";
/** overcast: thinly overcast or >= 4/8 low cloud; clear: <= 3/8 cloud */
export type NightCloud = "overcast" | "clear";
export const WIND_BANDS = ["<2", "2-3", "3-5", "5-6", ">6"] as const;
export type WindBand = typeof WIND_BANDS[number];

/** The band of a 10 m wind: a lower bound is inclusive (2 m/s is "2-3"). */
export function windBand(u: number): WindBand {
  if (u < 2) return "<2";
  if (u < 3) return "2-3";
  if (u < 5) return "3-5";
  if (u <= 6) return "5-6";
  return ">6";
}

type Cell = readonly StabilityClass[];
const cell = (...k: StabilityClass[]): Cell => k;

/** TURNER'S TABLE.  A cell with two letters (A-B) means "the class between":
 *  the page offers both.  An empty cell is a dash in the table: no class. */
export const TURNER_TABLE: Record<WindBand, {
  strong: Cell; moderate: Cell; slight: Cell; overcast: Cell; clear: Cell;
}> = {
  "<2":  { strong: cell("A"), moderate: cell("A", "B"), slight: cell("B"), overcast: cell(), clear: cell() },
  "2-3": { strong: cell("A", "B"), moderate: cell("B"), slight: cell("C"), overcast: cell("E"), clear: cell("F") },
  "3-5": { strong: cell("B"), moderate: cell("B", "C"), slight: cell("C"), overcast: cell("D"), clear: cell("E") },
  "5-6": { strong: cell("C"), moderate: cell("C", "D"), slight: cell("D"), overcast: cell("D"), clear: cell("D") },
  ">6":  { strong: cell("C"), moderate: cell("D"), slight: cell("D"), overcast: cell("D"), clear: cell("D") },
};
export const TURNER_VERIFIED: Verified = "unread";

export interface Weather {
  day: boolean;
  insolation: Insolation;
  cloud: NightCloud;
  wind10: number;
}

export type TurnerColumn = Insolation | NightCloud;
export function turnerColumn(w: Weather): TurnerColumn {
  return w.day ? w.insolation : w.cloud;
}

/** The class (or two adjacent classes, or none) the table gives. */
export function pickClasses(w: Weather): readonly StabilityClass[] {
  return TURNER_TABLE[windBand(w.wind10)][turnerColumn(w)];
}

// ---- 4. plume rise -------------------------------------------------------------

/** F = g v_s d^2 (T_s - T_a) / (4 T_s), m4/s3. */
export function buoyancyFlux(vs: number, d: number, Ts: number, Ta: number): number {
  return (G * vs * d * d * (Ts - Ta)) / (4 * Ts);
}

/** potential-temperature gradients assumed for stable air, K/m (usual
 *  practice; UNREAD for this page). */
export const STABLE_DTHETA_DZ: Partial<Record<StabilityClass, number>> = { E: 0.02, F: 0.035 };
export const F_SPLIT = 55; // m4/s3

/** Briggs' final rise.  Neutral and unstable (A-D): the two buoyancy regimes.
 *  Stable (E, F): 2.6 (F / (u s))^(1/3), s = g/Ta dtheta/dz.  No buoyancy
 *  (F <= 0): no rise -- a cold jet's MOMENTUM rise is not built. */
export function finalRise(F: number, u: number, cls: StabilityClass, Ta: number): number {
  if (!(F > 0) || !(u > 0)) return 0;
  const g = STABLE_DTHETA_DZ[cls];
  if (g !== undefined) {
    const s = (G / Ta) * g;
    return 2.6 * Math.cbrt(F / (u * s));
  }
  return F < F_SPLIT ? (21.425 * Math.pow(F, 0.75)) / u : (38.71 * Math.pow(F, 0.6)) / u;
}

export interface Release {
  Q: number;   // g/s
  u: number;   // m/s, 10 m wind, used at every height
  hs: number;  // m, physical stack height
  d: number;   // m, exit diameter
  vs: number;  // m/s
  Ts: number;  // K
  Ta: number;  // K
}

export const fluxOf = (r: Release): number => buoyancyFlux(r.vs, r.d, r.Ts, r.Ta);

export const effectiveHeight = (r: Release, cls: StabilityClass): number =>
  r.hs + finalRise(fluxOf(r), r.u, cls, r.Ta);

// ---- 5. the ground-level maximum and the inversion -----------------------------

export interface GroundMax { x: number; C: number; atEdge: boolean }

export function glcAt(r: Release, cls: StabilityClass, t: Terrain, x: number): number {
  return groundCentreline(r.Q, r.u, sigmaY(x, cls, t), sigmaZ(x, cls, t),
    effectiveHeight(r, cls));
}

/** Maximum of C(x,0,0) over [lo, hi]: a log grid, then a golden-section
 *  refinement about the best grid point.  `atEdge` flags a maximum at a
 *  window boundary -- the true maximum lies outside it. */
export function groundMax(
  r: Release, cls: StabilityClass, t: Terrain, window: readonly [number, number] = WINDOW_M,
): GroundMax {
  const [lo, hi] = window;
  const n = 240;
  const f = (x: number) => glcAt(r, cls, t, x);
  const xk = (k: number) => lo * Math.pow(hi / lo, k / n);
  let best = -1, bi = 0;
  for (let k = 0; k <= n; k++) {
    const v = f(xk(k));
    if (v > best) { best = v; bi = k; }
  }
  const atEdge = bi === 0 || bi === n;
  let a = Math.log(xk(Math.max(bi - 1, 0))), b = Math.log(xk(Math.min(bi + 1, n)));
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = b - phi * (b - a), x2 = a + phi * (b - a);
  let f1 = f(Math.exp(x1)), f2 = f(Math.exp(x2));
  for (let it = 0; it < 80; it++) {
    if (f1 > f2) { b = x2; x2 = x1; f2 = f1; x1 = b - phi * (b - a); f1 = f(Math.exp(x1)); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + phi * (b - a); f2 = f(Math.exp(x2)); }
  }
  const xm = Math.exp((a + b) / 2);
  const cm = f(xm);
  return cm >= best ? { x: xm, C: cm, atEdge } : { x: xk(bi), C: best, atEdge };
}

export interface Worst { cls: StabilityClass; max: GroundMax }

/** The worst of the allowed classes: the largest ground maximum. */
export function worstClass(
  r: Release, classes: readonly StabilityClass[], t: Terrain,
): Worst {
  let w: Worst | null = null;
  for (const cls of classes) {
    const m = groundMax(r, cls, t);
    if (w === null || m.C > w.max.C) w = { cls, max: m };
  }
  if (!w) throw new Error("worstClass: no class given");
  return w;
}

/** The least PHYSICAL stack height for which the worst allowed class keeps
 *  the ground maximum at or under `limit` (g/m3 for Q in g/s).  Bisection:
 *  every ground concentration falls with h_s at every x, so the maximum over
 *  a fixed window falls with it.  null when even `hMax` is not enough. */
export function leastStackHeight(
  r: Release, classes: readonly StabilityClass[], t: Terrain, limit: number,
  hMax = 1000,
): number | null {
  const over = (hs: number) => worstClass({ ...r, hs }, classes, t).max.C > limit;
  if (!over(0)) return 0;
  if (over(hMax)) return null;
  let lo = 0, hi = hMax;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (over(mid)) lo = mid; else hi = mid;
  }
  return hi;
}

// ---- 6. building downwash --------------------------------------------------------

/** H_GEP = H_b + 1.5 L, L the lesser of the building's height and projected
 *  width (40 CFR 51.100(ii), the formula clause). */
export function gepHeight(hb: number, widthB: number): number {
  return hb + 1.5 * Math.min(hb, widthB);
}

// ---- the engine half: a stream to an emission ---------------------------------------

export interface FlueStream {
  /** kmol/s, K, Pa, mole fractions: the engine's StreamResult fields */
  F: number; T: number; P: number; composition: { [c: string]: number };
}
export const R_GAS = 8.314462618; // J/(mol K), CODATA 2018

export interface Emission {
  /** g/s of the species, for `trains` identical trains sharing one stack */
  Q: number;
  /** m3/s of flue gas at the stack temperature (ideal gas) */
  Vdot: number;
  /** mole fraction of the species in the stream, in ppm */
  ppm: number;
}

/** Q = n F x M ; V = n F R Ts / P (ideal gas at the stack temperature).  The
 *  stream is READ: nothing here recomputes the burner. */
export function emissionFromStream(
  s: FlueStream, species: string, molarMass: number, trains: number, Ts: number,
): Emission {
  const x = s.composition[species] ?? 0;
  const Fmol = s.F * 1000 * trains; // mol/s
  return {
    Q: Fmol * x * molarMass,        // mol/s * g/mol = g/s
    Vdot: (Fmol * R_GAS * Ts) / s.P,
    ppm: x * 1e6,
  };
}

/** The exit velocity that a volume flow gives through a circular stack. */
export const exitVelocity = (Vdot: number, d: number): number =>
  (4 * Vdot) / (Math.PI * d * d);

export const G_PER_M3_TO_UG = 1e6;
export const G_PER_M3_TO_MG = 1e3;
