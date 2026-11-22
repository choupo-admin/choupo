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
  transferUnitMath -- the page's arithmetic for the `transfer-unit` EduTool,
  kept apart from the React so tests/transferUnit.test.ts can recompute it
  (a page must not teach against its own code).

  THE DILUTE ABSORBER.  Straight equilibrium line y* = m x, straight
  operating line, solute-free liquid in (x_in = 0), constant G and L.  Then
  (Treybal, Mass-Transfer Operations, 3rd ed., Eq. 8.50, "Colburn's equation")

      N_OG = ln[ (1 - 1/A) y_in/y_out + 1/A ] / (1 - 1/A),   A = L/(m G),

  with the A = 1 limit N_OG = y_in/y_out - 1.  The recovery is
  R = 1 - y_out/y_in, so y_in/y_out = 1/(1 - R).

  THE POLE IS AT A = R, NOT AT A = 1.  The argument of the logarithm is
  (1 - 1/A)/(1 - R) + 1/A, which is zero exactly at A = R (the liquid that
  leaves in equilibrium with the entering gas: the minimum liquid rate).  At
  A = 1 the number is R/(1 - R), large at high recovery but finite; below
  A = R no tower of any height does the job.

  HETP.  The Kremser stage count of the same two straight lines is
  N_t = ln[ ... ] / ln A with the SAME bracket, so N_OG (1 - 1/A) = N_t ln A
  and Z = N_OG H_OG = N_t HETP gives, with lambda = m G / L = 1/A,

      HETP = H_OG ln(lambda) / (lambda - 1)

  which is the relation the engine writes (src/unitOperations/distillation/
  PackingRBF.cpp:138-139).  It is derived here, not quoted.
\*---------------------------------------------------------------------------*/

/** y_in / y_out of a recovery R (0 <= R < 1). */
export function concentrationRatio(R: number): number {
  return 1 / (1 - R);
}

/** The absorption factor below which no height does the job: A = R. */
export function minimumAbsorptionFactor(R: number): number {
  return R;
}

/** Colburn's N_OG for the dilute absorber, or `null` when A <= R (the
 *  liquid is too lean for any height: the bracket of the logarithm is not
 *  positive). */
export function colburnNOG(R: number, A: number): number | null {
  const r = concentrationRatio(R);
  if (Math.abs(A - 1) < 1.0e-9) return r - 1;
  const bracket = (1 - 1 / A) * r + 1 / A;
  if (!(bracket > 0)) return null;
  return Math.log(bracket) / (1 - 1 / A);
}

/** Kremser's number of equilibrium stages, same two lines, same recovery. */
export function kremserStages(R: number, A: number): number | null {
  const r = concentrationRatio(R);
  if (Math.abs(A - 1) < 1.0e-9) return r - 1;
  const bracket = (1 - 1 / A) * r + 1 / A;
  if (!(bracket > 0)) return null;
  return Math.log(bracket) / Math.log(A);
}

/** N_OG as the integral of dy/(y* - y) along the straight lines, by the
 *  midpoint rule: the definition, used to hold the closed form to it.  In
 *  units of y_in, the operating line is x = (G/L)(y - y_out), so
 *  y* = m x = (y - y_out)/A. */
export function nogByQuadrature(R: number, A: number, n = 20000): number {
  const yIn = 1, yOut = 1 - R;
  let s = 0;
  const h = (yIn - yOut) / n;
  for (let i = 0; i < n; i++) {
    const y = yOut + (i + 0.5) * h;
    const ystar = (y - yOut) / A;
    s += h / (y - ystar);
  }
  return s;
}

/** The height of one transfer unit from the HETP and lambda, and back. */
export function hetpFromHog(HOG: number, lambda: number): number {
  return Math.abs(lambda - 1) < 1.0e-9 ? HOG : HOG * Math.log(lambda) / (lambda - 1);
}

/** HETP / H_OG as a function of lambda (positive, decreasing). */
export function hetpOverHog(lambda: number): number {
  return hetpFromHog(1, lambda);
}

/** The lambda whose HETP / H_OG equals `ratio` (0 < ratio), by bisection on
 *  ln lambda in [-30, 30]; `null` when the ratio is not reachable. */
export function impliedLambda(ratio: number): number | null {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return null;
  let lo = -30, hi = 30;
  // hetpOverHog is decreasing in lambda
  if (hetpOverHog(Math.exp(lo)) < ratio || hetpOverHog(Math.exp(hi)) > ratio) return null;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (hetpOverHog(Math.exp(mid)) > ratio) lo = mid; else hi = mid;
  }
  return Math.exp(0.5 * (lo + hi));
}

/** What a bed's published segments say. */
export interface BedSummary {
  segments: number;
  dz: number;
  height: number;
  NOG: number;
  HOGmean: number;
  lambdaMean: number;
  hetpFromSegments: number;
}

/** From the published profile columns (`z` the uniform segment mid-heights,
 *  `HOG`, `m`, `V`, `L`): Z = n dz; N_OG = sum dz / H_OG_k (the integral of
 *  dz/H_OG, which equals the integral of dy/(y* - y) when
 *  dy/dz = (y* - y)/H_OG); the mean H_OG; and the HETP that the published
 *  H_OG and lambda = m V / L give segment by segment, averaged (the
 *  `HETP_local_mean` convention of the packed bed). */
export function summariseBed(
  z: readonly number[], HOG: readonly number[], m: readonly number[],
  V: readonly number[], L: readonly number[],
): BedSummary | null {
  const n = z.length;
  if (n < 2 || HOG.length !== n || m.length !== n || V.length !== n || L.length !== n) return null;
  const dz = z[1]! - z[0]!;
  if (!(dz > 0)) return null;
  let sInv = 0, sH = 0, sLam = 0, sHetp = 0;
  for (let k = 0; k < n; k++) {
    const lam = m[k]! * V[k]! / L[k]!;
    sInv += dz / HOG[k]!;
    sH += HOG[k]!;
    sLam += lam;
    sHetp += hetpFromHog(HOG[k]!, lam);
  }
  return {
    segments: n, dz, height: n * dz, NOG: sInv, HOGmean: sH / n,
    lambdaMean: sLam / n, hetpFromSegments: sHetp / n,
  };
}

/** The curve N_OG(A) at a fixed recovery on a grid of A in [aMin, aMax]
 *  (points at or below the pole are dropped). */
export function nogCurve(R: number, aMin: number, aMax: number, n = 240): { A: number; N: number }[] {
  const out: { A: number; N: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const A = aMin + (aMax - aMin) * i / n;
    const N = colburnNOG(R, A);
    if (N !== null && Number.isFinite(N)) out.push({ A, N });
  }
  return out;
}
