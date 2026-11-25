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
  gasLine -- the arithmetic of "How far can a gas line go?" (C506).

  THE ENGINE OWNS THE PHYSICS.  `Pipe::solveGasLine`
  (src/unitOperations/hydraulics/Pipe.cpp) solves, for an all-vapour inlet,
  the steady isothermal horizontal constant-area flow of a gas:

      c    = P1 / rho1 = Z R T / M                        Pipe.cpp:857
      G    = mdot / (pi D^2 / 4)
      Re   = G D / mu   (the same at every section)       Pipe.cpp:859
      P1^2 - P2^2 = c G^2 [ f L/D + SUM K + 2 ln(P1/P2) ] (the exact form)
      P2^2 = P1^2 - c G^2 [ f L/D + SUM K ]               Pipe.cpp:904
      P_choke = G sqrt(c)                                 Pipe.cpp:884
      (f L/D + SUM K)_max = (P1^2 - Pch^2)/(c G^2) - 2 ln(P1/Pch)
                                                          Pipe.cpp:891-892

  WHAT THIS FILE ADDS is the same algebra as functions of the two numbers
  the page lets the reader move (the flow and the length), the profile P(x)
  (the exact form inverted at each x, and a fourth-order Runge-Kutta
  integration of the differential form that the test holds it to), and the
  length at which the engine's 40 % advisory begins.  The fixed numbers are
  those of the engine's own run of tutorials/steady/hydraulics/
  pipe09_isothermal_gas_line (its golden `expected`): the test reads that
  file and holds every number this module returns at the defaults to it.

  f is Churchill's, written as the engine writes it (friction/
  FrictionFactorCorrelation.cpp:288-290 and 315-317), because the flow
  slider changes Re = G D / mu and therefore f.  Re does not change along
  the line (mu depends on T only, and T is held), so one f serves a whole
  profile.  The page has no fittings (SUM K = 0, as in pipe09).

  Pure and dependency-free, so the node test runner imports it.
\*---------------------------------------------------------------------------*/

/** Universal gas constant, J/(mol K): src/core/Constants.H:47. */
export const R_GAS = 8.314462618;

/** The page's fixed inputs: pipe09_isothermal_gas_line, read by the test from
 *  the case's own dictionaries and golden. */
export interface GasLineFixed {
  /** Inlet pressure, Pa (0/feed). */
  P1: number;
  /** Temperature, K (held along the line). */
  T: number;
  /** Internal diameter, m. */
  D: number;
  /** Absolute roughness, m. */
  eps: number;
  /** Molar mass, kg/kmol (data/standards/components/N2.dat). */
  MW: number;
  /** Gas viscosity, Pa s: the golden's `viscosity` (the Chung model at T). */
  mu: number;
  /** Compressibility at the inlet, held along the line (the golden's
   *  compressibilityZ; the idealGas model gives 1). */
  Z: number;
}

export const PIPE09: GasLineFixed = {
  P1: 800000, T: 300, D: 0.05, eps: 4.6e-5, MW: 28.013,
  mu: 1.78433840676e-5, Z: 1,
};
/** The case's own flow and length. */
export const PIPE09_FLOW_KMOLH = 45;
export const PIPE09_L_M = 300;

/** The engine's flag level for the pressure drop, as a fraction of P1
 *  (Pipe.cpp:928).  A flag, not a derived bound. */
export const ADVISORY_DROP = 0.4;

/** Churchill (1977) as FrictionFactorCorrelation.cpp:288-290 and FrictionFactorCorrelation.cpp:315-317. */
export function churchill(Re: number, relRough: number): number {
  const inner = Math.pow(7 / Re, 0.9) + 0.27 * relRough;
  const A = Math.pow(-2.457 * Math.log(inner), 16);
  const B = Math.pow(37530 / Re, 16);
  const term = Math.pow(8 / Re, 12) + 1 / Math.pow(A + B, 1.5);
  return 8 * Math.pow(term, 1 / 12);
}

/** Everything that does not depend on the length: the gas, the flux, f, the
 *  choking pressure and the longest line. */
export interface GasState {
  c: number;       // m2/s2
  area: number;    // m2
  G: number;       // kg/(m2 s)
  Re: number;
  f: number;
  Pch: number;     // Pa
  M1: number;      // isothermal Mach number at the inlet
  /** (f L/D)_max, the exact form at P2 = Pch (no fittings). */
  Kmax: number;
  Lmax: number;    // m
  /** The inlet is at or beyond the isothermal sonic limit: Pipe.cpp:886-888. */
  inletChoked: boolean;
}

export function gasState(p: GasLineFixed, flowKmolH: number): GasState {
  const area = Math.PI * p.D * p.D / 4;
  const mdot = (flowKmolH / 3600) * p.MW;
  const G = mdot / area;
  const c = p.Z * R_GAS * p.T * 1000 / p.MW;
  const Re = G * p.D / p.mu;
  const f = churchill(Re, p.eps / p.D);
  const Pch = G * Math.sqrt(c);
  const M1 = Pch / p.P1;
  const inletChoked = M1 >= 1;
  const Kmax = inletChoked ? NaN
    : (p.P1 * p.P1 - Pch * Pch) / (c * G * G) - 2 * Math.log(p.P1 / Pch);
  return { c, area, G, Re, f, Pch, M1, Kmax, Lmax: Kmax * p.D / f, inletChoked };
}

/** The exact form solved for P2 given K = f L/D (bisection on
 *  [Pch, P1], where g is monotone: Pipe.cpp's own bracket). */
export function pExact(p: GasLineFixed, s: GasState, K: number): number {
  const cG2 = s.c * s.G * s.G;
  const g = (P: number): number => p.P1 * p.P1 - P * P - cG2 * (K + 2 * Math.log(p.P1 / P));
  let lo = s.Pch, hi = p.P1;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (g(mid) > 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** The mean-density shortcut, P2^2 = P1^2 - c G^2 K (Pipe.cpp:904). */
export const pMean = (p: GasLineFixed, s: GasState, K: number): number =>
  Math.sqrt(p.P1 * p.P1 - s.c * s.G * s.G * K);

export type LineVerdict = "ok" | "choked" | "inletChoked";

export interface GasLine extends GasState {
  L: number;
  verdict: LineVerdict;
  K: number;
  P2: number; P2mean: number;
  dP: number; dPmean: number;
  /** (P2mean - P2) / P2, the engine's `meanDensityError_P_out` (Pipe.cpp:925). */
  errP2: number;
  /** (dPmean - dP) / dP, the figure the engine prints as "dP error". */
  errDP: number;
  M2: number;
  dropFrac: number;
}

/** The whole line at one flow and one length.  When the engine would refuse
 *  (Pipe.cpp:886-888 or 893-897) the outlet fields are NaN and `verdict` says why. */
export function gasLine(p: GasLineFixed, flowKmolH: number, L: number): GasLine {
  const s = gasState(p, flowKmolH);
  const K = s.f * L / p.D;
  const nan = NaN;
  const base = { ...s, L, K };
  if (s.inletChoked)
    return { ...base, verdict: "inletChoked", P2: nan, P2mean: nan, dP: nan, dPmean: nan,
      errP2: nan, errDP: nan, M2: nan, dropFrac: nan };
  if (K >= s.Kmax)
    return { ...base, verdict: "choked", P2: nan, P2mean: nan, dP: nan, dPmean: nan,
      errP2: nan, errDP: nan, M2: nan, dropFrac: nan };
  const P2 = pExact(p, s, K), P2mean = pMean(p, s, K);
  const dP = p.P1 - P2, dPmean = p.P1 - P2mean;
  return { ...base, verdict: "ok", P2, P2mean, dP, dPmean,
    errP2: (P2mean - P2) / P2, errDP: (dPmean - dP) / dP,
    M2: s.Pch / P2, dropFrac: dP / p.P1 };
}

/** The line at which the pressure has fallen by `frac` of P1: the exact form
 *  at P2 = (1 - frac) P1, solved for f L / D, then L.  With `frac` =
 *  ADVISORY_DROP it is where the engine's advisory starts.  Null when that
 *  drop is not reached before the choking limit. */
export function lengthAtDrop(p: GasLineFixed, flowKmolH: number, frac: number): number | null {
  const s = gasState(p, flowKmolH);
  if (s.inletChoked) return null;
  const P2 = (1 - frac) * p.P1;
  if (P2 <= s.Pch) return null;
  const K = (p.P1 * p.P1 - P2 * P2) / (s.c * s.G * s.G) - 2 * Math.log(p.P1 / P2);
  return K * p.D / s.f;
}

/** The profile P(x), x in [0, xEnd], n+1 points, in Pa: the exact form
 *  inverted at each x, and the mean-density shortcut. */
export function profile(
  p: GasLineFixed, flowKmolH: number, xEnd: number, n: number,
): { x: number[]; exact: number[]; mean: number[] } {
  const s = gasState(p, flowKmolH);
  const x: number[] = [], exact: number[] = [], mean: number[] = [];
  for (let i = 0; i <= n; i++) {
    const xi = (xEnd * i) / n;
    const K = s.f * xi / p.D;
    x.push(xi);
    exact.push(i === 0 ? p.P1 : pExact(p, s, K));
    mean.push(i === 0 ? p.P1 : pMean(p, s, K));
  }
  return { x, exact, mean };
}

/** dP/dx of the differential form, Pa/m (Theory Guide, sec:pipe-gasline):
 *  dP/dx = -(f G^2 / 2D) / (P/c - G^2/P). */
export const dPdx = (p: GasLineFixed, s: GasState, P: number): number =>
  -(s.f * s.G * s.G / (2 * p.D)) / (P / s.c - s.G * s.G / P);

/** Fourth-order Runge-Kutta on the differential form from P1 over xEnd, in
 *  `steps` steps: the closed form is not assumed, it is integrated against.
 *  Used by the test; the page draws the inversion. */
export function rk4Outlet(p: GasLineFixed, flowKmolH: number, xEnd: number, steps: number): number {
  const s = gasState(p, flowKmolH);
  const h = xEnd / steps;
  let P = p.P1;
  for (let i = 0; i < steps; i++) {
    const k1 = dPdx(p, s, P);
    const k2 = dPdx(p, s, P + 0.5 * h * k1);
    const k3 = dPdx(p, s, P + 0.5 * h * k2);
    const k4 = dPdx(p, s, P + h * k3);
    P += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return P;
}

/** The isothermal Mach number at a pressure: u / sqrt(c) = Pch / P. */
export const machAt = (s: GasState, P: number): number => s.Pch / P;

/** The adiabatic Mach number at which the isothermal one reaches 1: 1 / sqrt(gamma). */
export const adiabaticMachAtChoke = (gamma: number): number => 1 / Math.sqrt(gamma);

/** The shortcut's dP error against the length, at n points up to a share of
 *  L_max (the error grows without bound as the line approaches it). */
export function errorCurve(
  p: GasLineFixed, flowKmolH: number, share: number, n: number,
): { L: number[]; errDP: number[]; errP2: number[]; drop: number[] } {
  const s = gasState(p, flowKmolH);
  const L: number[] = [], errDP: number[] = [], errP2: number[] = [], drop: number[] = [];
  if (s.inletChoked) return { L, errDP, errP2, drop };
  for (let i = 1; i <= n; i++) {
    const Li = (share * s.Lmax * i) / n;
    const g = gasLine(p, flowKmolH, Li);
    L.push(Li); errDP.push(g.errDP); errP2.push(g.errP2); drop.push(g.dropFrac);
  }
  return { L, errDP, errP2, drop };
}
