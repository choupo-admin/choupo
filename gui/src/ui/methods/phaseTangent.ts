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
  phaseTangent -- the algebra of "How many phases?" on the engine's tables.

  The engine (propertyScanBinary with a `stability` block, case
  tutorials/props/scan/binary04_tangent_plane_water_nbutanol) publishes, on
  one grid of interior nodes x1 = i/n: the molar Gibbs energy of mixing
  (`gmix`, J/mol), the two coexisting liquids (`binodal`), the activities of
  both components (`activity`), the activities in the two liquids
  (`binodalActivity`) and the tangent-plane distance of its declared feed
  (`tpd`, `stationary`).  Everything below is arithmetic on those columns:

      ln a_i(x)       = ln(x_i) + ln gamma_i(x)            (a node of `activity`)
      g(x)/RT         = x1 ln a1 + x2 ln a2                (= gmix / (R T))
      tangent at z    : line through (0, ln a2(z)) and (1, ln a1(z))
      tm_z(y)         = g(y)/RT - tangent_z(y)
                      = sum_i y_i [ ln a_i(y) - ln a_i(z) ]

  The page's feed z sits on a node, so its activities are the engine's own
  numbers, not an interpolation.  No thermodynamic model is evaluated here.
\*---------------------------------------------------------------------------*/

/** One engine table: named columns, every row full width. */
export interface EngineTable {
  readonly cols: readonly string[];
  readonly rows: readonly (readonly number[])[];
}

/** What the page reads from the engine's run. */
export interface PhasesData {
  /** The run's T in K (the engine's `T` diagnostic). */
  readonly T: number;
  /** Interior nodes x1 = i/n. */
  readonly x: readonly number[];
  /** g_mix in J/mol at each node (the engine's `gmix`). */
  readonly gJ: readonly number[];
  readonly a1: readonly number[];
  readonly a2: readonly number[];
  /** The two coexisting liquids in increasing x1 (the butanol-rich one first, the
   *  water-rich one second): x1, g in J/mol, the fraction of the feed that becomes it. */
  readonly binodal: readonly { x: number; gJ: number; beta: number }[];
  /** Their activities (equal in the two rows at equilibrium). */
  readonly binAct: readonly { x: number; a1: number; a2: number }[];
  /** The engine's tm(y) for its declared feed (tpd table). */
  readonly tpd: readonly { y: number; tm: number }[];
  /** The engine's own Michelsen test on its declared feed. */
  readonly stationary: { feed: number; unstable: boolean; tmMin: number; y1: number } | null;
}

export const lnA1 = (d: PhasesData, k: number): number => Math.log(d.a1[k]!);
export const lnA2 = (d: PhasesData, k: number): number => Math.log(d.a2[k]!);

/** g_mix / RT at node k. */
export function gOverRT(d: PhasesData, k: number): number {
  const x = d.x[k]!;
  return x * lnA1(d, k) + (1 - x) * lnA2(d, k);
}

/** The node index of a composition on the grid (the nearest node). */
export function nodeOf(d: PhasesData, z: number): number {
  let best = 0;
  for (let k = 1; k < d.x.length; k++)
    if (Math.abs(d.x[k]! - z) < Math.abs(d.x[best]! - z)) best = k;
  return best;
}

/** The tangent to g/RT at node k: g(y) = intercept + slope * y. */
export function tangentAt(d: PhasesData, k: number): { slope: number; intercept: number } {
  return { slope: lnA1(d, k) - lnA2(d, k), intercept: lnA2(d, k) };
}

/** The tangent-plane distance at node k of a trial composition y with
 *  activities (a1, a2): sum_i y_i [ln a_i(y) - ln a_i(z)]. */
export function tmAt(d: PhasesData, k: number, y: number, a1: number, a2: number): number {
  return y * (Math.log(a1) - lnA1(d, k)) + (1 - y) * (Math.log(a2) - lnA2(d, k));
}

export interface TmPoint { readonly y: number; readonly tm: number; readonly binodal: boolean }

/** tm_z(y) along every grid node and at the two binodal compositions, in
 *  increasing y. */
export function tmCurve(d: PhasesData, k: number): TmPoint[] {
  const pts: TmPoint[] = d.x.map((y, j) => ({
    y, tm: tmAt(d, k, y, d.a1[j]!, d.a2[j]!), binodal: false,
  }));
  for (const b of d.binAct)
    pts.push({ y: b.x, tm: tmAt(d, k, b.x, b.a1, b.a2), binodal: true });
  return pts.sort((p, q) => p.y - q.y);
}

/** The verdict of the page's own scan: the lowest tm over the grid and the
 *  binodal compositions, the y it is at, and whether it proves a missing phase. */
export interface Verdict { readonly unstable: boolean; readonly tmMin: number; readonly y: number }
export const UNSTABLE_BELOW = -1e-9;
export function verdictAt(d: PhasesData, k: number): Verdict {
  let tmMin = Infinity, y = NaN;
  for (const p of tmCurve(d, k)) if (p.tm < tmMin) { tmMin = p.tm; y = p.y; }
  return { unstable: tmMin < UNSTABLE_BELOW, tmMin, y };
}

/** Stationary points of tm_z(y) on the sampled curve: interior local minima
 *  and maxima, plus the trivial point y = z.  A grid reading: the engine's own
 *  point for its declared feed is `PhasesData.stationary`. */
export interface Stationary {
  readonly y: number; readonly tm: number; readonly kind: "minimum" | "maximum" | "trivial";
}
export function stationaryPoints(d: PhasesData, k: number): Stationary[] {
  const pts = tmCurve(d, k).filter((p) => !p.binodal);
  const out: Stationary[] = [];
  for (let j = 1; j < pts.length - 1; j++) {
    const a = pts[j - 1]!.tm, b = pts[j]!.tm, c = pts[j + 1]!.tm;
    if (j === k) { out.push({ y: pts[j]!.y, tm: b, kind: "trivial" }); continue; }
    if (b < a && b <= c) out.push({ y: pts[j]!.y, tm: b, kind: "minimum" });
    else if (b > a && b >= c) out.push({ y: pts[j]!.y, tm: b, kind: "maximum" });
  }
  return out;
}

/** The lever rule on the engine's two liquids for a feed z.  `inside` is true
 *  when z lies between them; outside, one fraction is negative or above one
 *  and the equal-activity solution is a split that cannot be made. */
export interface Lever {
  readonly inside: boolean;
  /** The fraction of the feed that becomes the liquid at the lower x1 (x'). */
  readonly betaLo: number;
  /** The fraction that becomes the liquid at the higher x1 (x''). */
  readonly betaHi: number;
}
export function lever(d: PhasesData, z: number): Lever | null {
  if (d.binodal.length !== 2) return null;
  const xa = d.binodal[0]!.x, xb = d.binodal[1]!.x;
  const bb = (z - xa) / (xb - xa);
  return { inside: z > xa && z < xb, betaLo: 1 - bb, betaHi: bb };
}

/** g/RT of the engine's two liquids, and of the mixture split on the common
 *  tangent at z (the lever rule on their Gibbs energies). */
export function commonTangent(d: PhasesData): {
  xa: number; xb: number; ga: number; gb: number; slope: number; intercept: number;
} | null {
  if (d.binodal.length !== 2 || d.binAct.length !== 2) return null;
  const [A, B] = d.binAct as readonly [{ x: number; a1: number; a2: number }, { x: number; a1: number; a2: number }];
  const ga = A.x * Math.log(A.a1) + (1 - A.x) * Math.log(A.a2);
  const gb = B.x * Math.log(B.a1) + (1 - B.x) * Math.log(B.a2);
  const slope = (gb - ga) / (B.x - A.x);
  return { xa: A.x, xb: B.x, ga, gb, slope, intercept: ga - slope * A.x };
}

/** Solutions of the equal-activity conditions a1(x') = a1(x''), a2(x') = a2(x'')
 *  read off the activity table: pairs found on the sampled curves (a first
 *  estimate of the engine's binodal, to the grid's resolution).  The trivial
 *  family x' = x'' is not listed; it exists for every x'. */
export function isoActivityPairs(d: PhasesData): { lo: number; hi: number }[] {
  const n = d.x.length;
  const roots = (c: number): number[] => {
    const r: number[] = [];
    for (let j = 0; j + 1 < n; j++) {
      const u = d.a1[j]! - c, v = d.a1[j + 1]! - c;
      if (u === 0) r.push(d.x[j]!);
      else if (u * v < 0) r.push(d.x[j]! + (d.x[j + 1]! - d.x[j]!) * (-u) / (v - u));
    }
    return r;
  };
  const a2At = (x: number): number => {
    for (let j = 0; j + 1 < n; j++)
      if (x >= d.x[j]! && x <= d.x[j + 1]!) {
        const f = (x - d.x[j]!) / (d.x[j + 1]! - d.x[j]!);
        return d.a2[j]! + f * (d.a2[j + 1]! - d.a2[j]!);
      }
    return NaN;
  };
  const F: { c: number; lo: number; hi: number; f: number }[] = [];
  for (let j = 0; j < n; j++) {
    const r = roots(d.a1[j]!);
    if (r.length === 3) F.push({ c: d.a1[j]!, lo: r[0]!, hi: r[2]!, f: a2At(r[2]!) - a2At(r[0]!) });
  }
  const found: { lo: number; hi: number }[] = [];
  for (let j = 0; j + 1 < F.length; j++) {
    const p = F[j]!, q = F[j + 1]!;
    if (p.f * q.f < 0) {
      const t = p.f / (p.f - q.f);
      found.push({ lo: p.lo + t * (q.lo - p.lo), hi: p.hi + t * (q.hi - p.hi) });
    }
  }
  //  Interpolating the tables leaves a wiggle of rounding size around the
  //  root, which can cross zero twice: crossings within 0.02 in both ends are
  //  one solution.
  const out: { lo: number; hi: number }[] = [];
  for (const c of found) {
    const last = out[out.length - 1];
    if (last && Math.abs(c.lo - last.lo) < 0.02 && Math.abs(c.hi - last.hi) < 0.02) {
      last.lo = (last.lo + c.lo) / 2;
      last.hi = (last.hi + c.hi) / 2;
    } else out.push({ ...c });
  }
  return out;
}

/** Parse the engine's series-view CSV (`series,x,y,yError`, 12 figures) into
 *  one array of [x, y] per series name. */
export function parseSeriesCsv(text: string): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (!l) continue;
    const c = l.split(",");
    const x = Number(c[1]), y = Number(c[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const a = out.get(c[0]!) ?? [];
    a.push([x, y]);
    out.set(c[0]!, a);
  }
  return out;
}

/** Build the page's data from the series-view CSVs the case writes
 *  (`postProcessing/lle/<view>.csv`: lleMap, activity, tpd, betas,
 *  binodalActivity, stationary).  `get` returns a view's text or undefined.
 *  Null when a needed view is missing or inconsistent: the page then says so. */
export function phasesFromViews(
  get: (view: string) => string | undefined, T: number,
): PhasesData | null {
  const need = (view: string): Map<string, [number, number][]> | null => {
    const t = get(view);
    return t === undefined ? null : parseSeriesCsv(t);
  };
  const lle = need("lleMap"), act = need("activity"), tp = need("tpd");
  const bet = need("betas"), ba = need("binodalActivity"), st = need("stationary");
  if (!lle || !act || !tp) return null;
  const curve = lle.get("curve"), a1 = act.get("a1"), a2 = act.get("a2"), tm = tp.get("tm");
  if (!curve || !a1 || !a2 || !tm || curve.length !== a1.length || a1.length !== a2.length)
    return null;
  const betaRows = bet ? [...bet.values()][0] ?? [] : [];
  const bin = (lle.get("binodal") ?? []).map(([x, gJ], i) => ({
    x, gJ, beta: betaRows[i]?.[1] ?? NaN,
  })).sort((p, q) => p.x - q.x);
  const binAct = (ba?.get("a1") ?? []).map(([x, v], i) => ({
    x, a1: v, a2: ba?.get("a2")?.[i]?.[1] ?? NaN,
  })).sort((p, q) => p.x - q.x);
  const one = (k: string): number | undefined => st?.get(k)?.[0]?.[1];
  const stationary = st && one("tmMin") !== undefined
    ? { feed: st.get("tmMin")![0]![0], unstable: one("unstable") === 1,
        tmMin: one("tmMin")!, y1: one("y1")! }
    : null;
  return {
    T, x: curve.map((p) => p[0]), gJ: curve.map((p) => p[1]),
    a1: a1.map((p) => p[1]), a2: a2.map((p) => p[1]),
    binodal: bin, binAct,
    tpd: tm.map(([y, v]) => ({ y, tm: v })), stationary,
  };
}
