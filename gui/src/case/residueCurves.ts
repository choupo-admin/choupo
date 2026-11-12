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
  residueCurves -- the PAGE's arithmetic behind the residue-curve-map EduTool,
  over a field the ENGINE computed.

  THE SPLIT, stated once because the page states it too:

    * the ENGINE (choupoProps, `propertyPoint`, one operation per grid node)
      supplies every equilibrium number: the bubble temperature T_b(x) and
      the vapour y*(x) in equilibrium with a liquid x at the declared
      pressure.  Nothing in this file computes an activity coefficient, a
      vapour pressure or a bubble point.
    * the PAGE (this file) does geometry and calculus on that field: it
      interpolates linearly inside each triangular grid cell, integrates
      dx/dxi = x - y*(x) with fourth-order Runge-Kutta, finds where x = y*
      (pure components, azeotropes), classifies each such point from the
      boiling temperatures around it, follows the separatrices out of the
      saddles, and draws the lever rule.  Every one of those results inherits
      the grid: a singular point is located to about one cell unless the
      refinement run (a second engine run on a finer local grid) is used.

  Coordinates: a composition is (x1, x2, x3) in the order the case declares
  its components; the integration runs in the reduced pair (x1, x2) with
  x3 = 1 - x1 - x2.  The grid node (i, j) is x1 = i/n, x2 = j/n.

  The proposal for a durable engine home (`residueCurveMap`) is in
  docs/design/residue-curve-maps.md: this file is the page's version of that
  operation, and says so on the page.
\*---------------------------------------------------------------------------*/

export type Vec3 = [number, number, number];
type Vec2 = [number, number];

export interface FieldNode { T: number; y: Vec3 }

/** The engine's field on the triangular grid.  `nodes[i][j]` is null where
 *  the engine did not return a finite T_bubble and y* (named, never filled). */
export interface RcmField {
  n: number;
  comps: readonly [string, string, string];
  P_Pa: number;
  nodes: (FieldNode | null)[][];
  missing: number;
}

// ---- the case the page asks the engine to run --------------------------------

export const RCM_CASE_NAME = "residueCurveMap";

/** A tag that names the question (components, pressure, grid) inside every
 *  operation name, so an answer can only be read against the question that
 *  produced it: a run still in flight when the student changes the preset
 *  returns operations whose names the new reader does not look up, and the
 *  page shows nothing rather than one mixture's numbers on another's map. */
export function rcmTag(comps: readonly string[], P_bar: number, n: number): string {
  const key = `${comps.join(",")}|${num(P_bar)}|${n}`;
  let h = 5381;
  for (let k = 0; k < key.length; k++) h = ((h * 33) ^ key.charCodeAt(k)) >>> 0;
  return h.toString(36);
}

export const gridOpName = (i: number, j: number, tag = ""): string =>
  `g${tag ? `_${tag}` : ""}_${i}_${j}`;
export const refineOpName = (k: number, tag = ""): string =>
  `r${tag ? `_${tag}` : ""}_${k}`;
export const llOpName = (tag = ""): string => `liquidSplitCheck${tag ? `_${tag}` : ""}`;

const num = (v: number): string => {
  //  A dict scalar written so the engine reads back exactly the grid node:
  //  enough digits that i/n round-trips, no exponent the reader would need.
  const s = v.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};

function pointOp(name: string, comps: readonly string[], x: Vec3, P_bar: number): string {
  const comp = comps.map((c, k) => `${c} ${num(x[k]!)};`).join(" ");
  //  T is required by propertyPoint's state block and is NOT used by the
  //  two properties asked for: T_bubble and y_eq_<comp> solve their own T.
  return `    { name ${name}; type propertyPoint; `
    + `state { T 300 K; P ${num(P_bar)} bar; composition { ${comp} } } `
    + `properties ( T_bubble ${comps.map((c) => `y_eq_${c}`).join(" ")} ); }`;
}

/** The grid nodes, every composition with x1 = i/n, x2 = j/n, x3 >= 0. */
export function gridCompositions(n: number): { i: number; j: number; x: Vec3 }[] {
  const out: { i: number; j: number; x: Vec3 }[] = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n - i; j++)
      out.push({ i, j, x: [i / n, j / n, (n - i - j) / n] });
  return out;
}

export function rcmControlDict(what: string): string {
  return [
    "application   choupoProps;",
    `description   "Residue curve map EduTool: ${what}";`,
    //  Level 0 keeps the log short: the page reads the structured result
    //  (operationResults, advisories, thermoResolution), not the console.
    "verbosity     0;", "",
  ].join("\n");
}

/** One liquid on the gamma-phi path, NRTL, the ideal gas: the package every
 *  point of the map is evaluated in.  The pairs are NOT written here -- the
 *  engine resolves each from the catalogue and reports where it found it. */
export function rcmThermoDict(comps: readonly string[]): string {
  return [
    "recordType    thermophysicalPropertySystem;",
    "schemaVersion 2;", "",
    `components    ( ${comps.join(" ")} );`, "",
    "equilibrium", "{",
    "    formulation gammaPhi;",
    "    liquid { activityModel NRTL; standardState pureLiquid; }",
    "    vapour { fugacityModel idealGas; }",
    "}", "",
  ].join("\n");
}

/** Run 1: the grid. */
export function rcmGridCaseFiles(
  comps: readonly string[], P_bar: number, n: number,
): Record<string, string> {
  const tag = rcmTag(comps, P_bar, n);
  const ops = gridCompositions(n).map((g) => pointOp(gridOpName(g.i, g.j, tag), comps, g.x, P_bar));
  return {
    [`${RCM_CASE_NAME}.cho`]: "",
    "system/controlDict": rcmControlDict(`grid n ${n} at ${num(P_bar)} bar`),
    "system/propsDict": `operations\n(\n${ops.join("\n")}\n);\n`,
    "constant/thermoPhysPropDict": rcmThermoDict(comps),
  };
}

/** Run 2: the refinement points around the located singular points, and the
 *  liquid-liquid check -- the engine's own LL flash over the whole triangle
 *  at `llT_K`, in a two-liquid package declared on that operation only. */
export function rcmRefineCaseFiles(
  comps: readonly string[], P_bar: number, points: readonly Vec3[], llT_K: number, tag = "",
): Record<string, string> {
  const ops = points.map((x, k) => pointOp(refineOpName(k, tag), comps, x, P_bar));
  const nrtl = "activityModel { model NRTL; }";
  ops.push(`    { name ${llOpName(tag)}; type propertyScanTernary; mode lle; `
    + `state { T ${num(llT_K)} K; P ${num(P_bar)} bar; } grid { n 20; } `
    + `output { file liquidSplit.csv; } `
    + `thermo { equilibrium { formulation gammaGamma; liquidPhases ( `
    + `{ name alpha; ${nrtl} } { name beta; ${nrtl} } ); `
    + `vapour { fugacityModel idealGas; } } } }`);
  return {
    [`${RCM_CASE_NAME}.cho`]: "",
    "system/controlDict": rcmControlDict(`refinement + liquid-liquid check at ${num(P_bar)} bar`),
    "system/propsDict": `operations\n(\n${ops.join("\n")}\n);\n`,
    "constant/thermoPhysPropDict": rcmThermoDict(comps),
  };
}

// ---- reading the engine's answer -------------------------------------------

export interface OpLike { name: string; diagnostics: { [k: string]: number } }

function nodeOf(d: { [k: string]: number }, comps: readonly string[]): FieldNode | null {
  const T = d["T_bubble"];
  const y = comps.map((c) => d[`y_eq_${c}`]);
  if (!Number.isFinite(T) || y.some((v) => !Number.isFinite(v))) return null;
  return { T: T!, y: [y[0]!, y[1]!, y[2]!] };
}

export function readRcmField(
  ops: readonly OpLike[], comps: readonly [string, string, string], n: number, P_Pa: number,
  tag = "",
): RcmField {
  const byName = new Map(ops.map((o) => [o.name, o.diagnostics]));
  const nodes: (FieldNode | null)[][] = [];
  let missing = 0;
  for (let i = 0; i <= n; i++) {
    const row: (FieldNode | null)[] = [];
    for (let j = 0; j <= n - i; j++) {
      const d = byName.get(gridOpName(i, j, tag));
      const nd = d ? nodeOf(d, comps) : null;
      if (!nd) missing++;
      row.push(nd);
    }
    nodes.push(row);
  }
  return { n, comps, P_Pa, nodes, missing };
}

export interface RefinedPoint { x: Vec3; T: number; y: Vec3 }

export function readRefinement(
  ops: readonly OpLike[], comps: readonly string[], points: readonly Vec3[], tag = "",
): (RefinedPoint | null)[] {
  const byName = new Map(ops.map((o) => [o.name, o.diagnostics]));
  return points.map((x, k) => {
    const d = byName.get(refineOpName(k, tag));
    const nd = d ? nodeOf(d, comps) : null;
    return nd ? { x, T: nd.T, y: nd.y } : null;
  });
}

// ---- interpolation ------------------------------------------------------------

const node = (f: RcmField, i: number, j: number): FieldNode | null =>
  i >= 0 && j >= 0 && i + j <= f.n ? (f.nodes[i]?.[j] ?? null) : null;

/** Clamp a reduced composition into the closed triangle. */
export function clampSimplex(p: Vec2): Vec2 {
  let a = Math.max(0, p[0]), b = Math.max(0, p[1]);
  const s = a + b;
  if (s > 1) { a /= s; b /= s; }
  return [a, b];
}

/** T and y* at a composition: linear interpolation inside the grid cell that
 *  holds it (barycentric weights of the cell's three nodes).  Null where a
 *  node of that cell is missing. */
export function fieldAt(f: RcmField, x1: number, x2: number): FieldNode | null {
  const [c1, c2] = clampSimplex([x1, x2]);
  const n = f.n;
  const a = c1 * n, b = c2 * n;
  //  The cell's lower-left node, clamped so a point on the far edge
  //  (x1 + x2 = 1) uses the cell just inside it: there fa + fb <= 1 holds.
  const i = Math.min(Math.max(Math.floor(a), 0), n - 1);
  const j = Math.min(Math.max(Math.floor(b), 0), n - 1 - i);
  const fa = a - i, fb = b - j;
  let w: [number, number, number];
  let k: [FieldNode | null, FieldNode | null, FieldNode | null];
  if (fa + fb <= 1 || i + j === n - 1) {
    //  The second condition absorbs round-off on the far edge, where the
    //  lower cell does not exist and fa + fb exceeds 1 by a few ulp.
    k = [node(f, i, j), node(f, i + 1, j), node(f, i, j + 1)];
    w = [Math.max(0, 1 - fa - fb), fa, fb];
  } else {
    k = [node(f, i + 1, j + 1), node(f, i, j + 1), node(f, i + 1, j)];
    w = [fa + fb - 1, 1 - fa, 1 - fb];
  }
  if (!k[0] || !k[1] || !k[2]) return null;
  const y: Vec3 = [0, 0, 0];
  let T = 0;
  for (let m = 0; m < 3; m++) {
    T += w[m]! * k[m]!.T;
    for (let c = 0; c < 3; c++) y[c] = y[c]! + w[m]! * k[m]!.y[c]!;
  }
  return { T, y };
}

/** x - y*(x) in the reduced pair: the right-hand side of the residue-curve
 *  equation dx/dxi = x - y*. */
export function driving(f: RcmField, p: Vec2): Vec2 | null {
  const fl = fieldAt(f, p[0], p[1]);
  if (!fl) return null;
  return [p[0] - fl.y[0], p[1] - fl.y[1]];
}

export const full = (p: Vec2): Vec3 => [p[0], p[1], 1 - p[0] - p[1]];

// ---- singular points -------------------------------------------------------------

export type SingularType = "unstable node" | "stable node" | "saddle";

export interface SingularPoint {
  kind: "pure" | "binary azeotrope" | "ternary azeotrope";
  x: Vec3;
  T: number;
  /** The type read from the boiling temperatures around the point. */
  type: SingularType;
  /** The type read from the eigenvalues of d(x - y*)/dx at the point, as a
   *  second, independent reading of the same field. */
  jacobianType: SingularType | "undetermined";
  /** For a binary azeotrope: the two components of its edge. */
  edge?: [number, number];
  /** How far the location can be trusted, in mole fraction: one grid cell
   *  unless the refinement run sharpened it. */
  resolution: number;
  refined: boolean;
}

/** The boiling temperatures on a ring around `x` (inside the triangle),
 *  minus the boiling temperature at `x`. */
function ringDeltas(f: RcmField, x: Vec2, Tx: number, r: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < 24; k++) {
    const th = (2 * Math.PI * k) / 24;
    //  The ring is drawn in the EQUILATERAL picture's metric, so every
    //  direction is sampled at the same drawn distance.
    const dx = r * Math.cos(th), dy = r * Math.sin(th);
    const d2 = (2 / Math.sqrt(3)) * dy;
    const d1 = -dx - 0.5 * d2;
    const q: Vec2 = [x[0] + d1, x[1] + d2];
    if (q[0] < -1e-12 || q[1] < -1e-12 || q[0] + q[1] > 1 + 1e-12) continue;
    const fl = fieldAt(f, q[0], q[1]);
    if (fl) out.push(fl.T - Tx);
  }
  return out;
}

export function typeFromT(deltas: readonly number[]): SingularType {
  if (deltas.length > 0 && deltas.every((d) => d > 0)) return "unstable node";
  if (deltas.length > 0 && deltas.every((d) => d < 0)) return "stable node";
  return "saddle";
}

/** d(x - y*)/dx in the reduced pair (columns d/dx1, d/dx2), from two
 *  finite-difference steps that stay INSIDE the triangle -- along an edge and
 *  inwards on an edge, along the two edges at a pure component -- converted
 *  back to the (x1, x2) axes.  Null where no two such steps exist. */
export function jacobian(f: RcmField, x: Vec2): [[number, number], [number, number]] | null {
  const h = 0.5 / f.n;
  const g0 = driving(f, x);
  if (!g0) return null;
  const DIRS: Vec2[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [-1, 1], [1, -1]];
  const steps: { d: Vec2; g: Vec2 }[] = [];
  for (const d of DIRS) {
    const q: Vec2 = [x[0] + h * d[0], x[1] + h * d[1]];
    if (q[0] < -1e-12 || q[1] < -1e-12 || q[0] + q[1] > 1 + 1e-12) continue;
    const g = driving(f, q);
    if (!g) continue;
    if (steps.length === 1) {
      const d0 = steps[0]!.d;
      if (Math.abs(d0[0] * d[1] - d0[1] * d[0]) < 1e-12) continue;
    }
    steps.push({ d, g: [(g[0] - g0[0]) / h, (g[1] - g0[1]) / h] });
    if (steps.length === 2) break;
  }
  if (steps.length < 2) return null;
  //  J D = G, with D = [d1 d2] and G = [G d1, G d2] as columns.
  const [s1, s2] = steps as [{ d: Vec2; g: Vec2 }, { d: Vec2; g: Vec2 }];
  const det = s1.d[0] * s2.d[1] - s2.d[0] * s1.d[1];
  const inv = [[s2.d[1] / det, -s2.d[0] / det], [-s1.d[1] / det, s1.d[0] / det]];
  const G = [[s1.g[0], s2.g[0]], [s1.g[1], s2.g[1]]];
  return [
    [G[0]![0]! * inv[0]![0]! + G[0]![1]! * inv[1]![0]!, G[0]![0]! * inv[0]![1]! + G[0]![1]! * inv[1]![1]!],
    [G[1]![0]! * inv[0]![0]! + G[1]![1]! * inv[1]![0]!, G[1]![0]! * inv[0]![1]! + G[1]![1]! * inv[1]![1]!],
  ];
}

export function eigen2(J: [[number, number], [number, number]]):
  { values: [number, number]; vectors: [Vec2, Vec2] } | null {
  const [[a, b], [c, d]] = J;
  const tr = a + d, det = a * d - b * c;
  const disc = tr * tr / 4 - det;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const l1 = tr / 2 + s, l2 = tr / 2 - s;
  const vec = (l: number): Vec2 => {
    let v: Vec2 = Math.abs(b) > Math.abs(c) ? [b, l - a] : [l - d, c];
    if (Math.hypot(v[0], v[1]) < 1e-14) v = Math.abs(a - l) < Math.abs(d - l) ? [1, 0] : [0, 1];
    const m = Math.hypot(v[0], v[1]);
    return [v[0] / m, v[1] / m];
  };
  return { values: [l1, l2], vectors: [vec(l1), vec(l2)] };
}

export function typeFromJacobian(J: [[number, number], [number, number]] | null):
  SingularType | "undetermined" {
  if (!J) return "undetermined";
  const [[a, b], [c, d]] = J;
  const tr = a + d, det = a * d - b * c;
  if (det < 0) return "saddle";
  if (det > 0 && tr > 0) return "unstable node";
  if (det > 0 && tr < 0) return "stable node";
  return "undetermined";
}

function classify(f: RcmField, p: Vec2, T: number): Pick<SingularPoint, "type" | "jacobianType"> {
  return {
    type: typeFromT(ringDeltas(f, p, T, 1.5 / f.n)),
    jacobianType: typeFromJacobian(jacobian(f, p)),
  };
}

/** Where the grid brackets a binary azeotrope: the interior nodes of an edge
 *  between which y_a - x_a changes sign.  The two pure ends are excluded,
 *  because y = x there by definition. */
export interface EdgeBracket { a: number; b: number; lo: Vec3; hi: Vec3 }

const EDGES: readonly [number, number][] = [[0, 1], [0, 2], [1, 2]];

function edgePoint(a: number, b: number, s: number): Vec3 {
  const x: Vec3 = [0, 0, 0];
  x[a] = s; x[b] = 1 - s;
  return x;
}

export function edgeBrackets(f: RcmField): EdgeBracket[] {
  const out: EdgeBracket[] = [];
  const n = f.n;
  for (const [a, b] of EDGES) {
    let prev: { s: number; g: number } | null = null;
    for (let k = 1; k < n; k++) {
      const s = k / n;
      const x = edgePoint(a, b, s);
      const fl = fieldAt(f, x[0], x[1]);
      if (!fl) { prev = null; continue; }
      const g = fl.y[a]! - x[a]!;
      if (prev && prev.g * g < 0)
        out.push({ a, b, lo: edgePoint(a, b, prev.s), hi: x });
      prev = { s, g };
    }
  }
  return out;
}

/** The interior cells whose linear interpolant of x - y* vanishes inside
 *  them, as the zero itself. */
export function interiorZeros(f: RcmField): Vec3[] {
  const n = f.n, out: Vec3[] = [];
  const at = (i: number, j: number) => {
    const nd = node(f, i, j);
    return nd ? { p: [i / n, j / n] as Vec2, g: [i / n - nd.y[0], j / n - nd.y[1]] as Vec2 } : null;
  };
  const tryCell = (cs: ReturnType<typeof at>[]) => {
    if (cs.some((c) => !c)) return;
    const [A, B, C] = cs as NonNullable<ReturnType<typeof at>>[];
    //  Solve w_A gA + w_B gB + w_C gC = 0 with w_A + w_B + w_C = 1.
    const m11 = A!.g[0] - C!.g[0], m12 = B!.g[0] - C!.g[0];
    const m21 = A!.g[1] - C!.g[1], m22 = B!.g[1] - C!.g[1];
    const det = m11 * m22 - m12 * m21;
    if (Math.abs(det) < 1e-18) return;
    const r1 = -C!.g[0], r2 = -C!.g[1];
    const wA = (r1 * m22 - m12 * r2) / det, wB = (m11 * r2 - r1 * m21) / det;
    const wC = 1 - wA - wB;
    //  A small negative weight is accepted: where one component's K is
    //  close to 1 the interpolant is nearly singular and its zero can fall a
    //  hair outside the cell it belongs to.  The candidate is then checked
    //  against the field itself, so a tolerance here cannot invent a point.
    const tol = -0.05;
    if (wA < tol || wB < tol || wC < tol) return;
    const p: Vec2 = [wA * A!.p[0] + wB * B!.p[0] + wC * C!.p[0],
                     wA * A!.p[1] + wB * B!.p[1] + wC * C!.p[1]];
    const x = full(p);
    //  Strictly interior: a zero on an edge is the edge scan's business.
    if (x.some((v) => v < 0.25 / n)) return;
    const g = driving(f, p);
    if (!g || Math.hypot(g[0], g[1]) > 0.05 / n) return;
    if (out.some((o) => Math.hypot(o[0] - x[0], o[1] - x[1]) < 1.5 / n)) return;
    out.push(x);
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n - i; j++) {
      tryCell([at(i, j), at(i + 1, j), at(i, j + 1)]);
      if (i + j + 2 <= n) tryCell([at(i + 1, j + 1), at(i, j + 1), at(i + 1, j)]);
    }
  return out;
}

/** The singular points from the grid alone. */
export function singularPoints(f: RcmField): SingularPoint[] {
  const out: SingularPoint[] = [];
  const h = 1 / f.n;
  for (let v = 0; v < 3; v++) {
    const x: Vec3 = [0, 0, 0]; x[v] = 1;
    const fl = fieldAt(f, x[0], x[1]);
    if (!fl) continue;
    out.push({ kind: "pure", x, T: fl.T, ...classify(f, [x[0], x[1]], fl.T),
      resolution: 0, refined: false });
  }
  for (const br of edgeBrackets(f)) {
    const lo = fieldAt(f, br.lo[0], br.lo[1])!, hi = fieldAt(f, br.hi[0], br.hi[1])!;
    const gl = lo.y[br.a]! - br.lo[br.a]!, gh = hi.y[br.a]! - br.hi[br.a]!;
    const t = gl / (gl - gh);
    const x: Vec3 = [0, 1, 2].map((c) => br.lo[c]! + t * (br.hi[c]! - br.lo[c]!)) as Vec3;
    const T = lo.T + t * (hi.T - lo.T);
    out.push({ kind: "binary azeotrope", x, T, ...classify(f, [x[0], x[1]], T),
      edge: [br.a, br.b], resolution: h, refined: false });
  }
  for (const x of interiorZeros(f)) {
    const fl = fieldAt(f, x[0], x[1]);
    if (!fl) continue;
    out.push({ kind: "ternary azeotrope", x, T: fl.T, ...classify(f, [x[0], x[1]], fl.T),
      resolution: h, refined: false });
  }
  return out;
}

// ---- refinement ---------------------------------------------------------------------

export const REFINE_EDGE_POINTS = 21;
export const REFINE_CELL_DIV = 8;

/** The compositions the refinement run asks about for each azeotrope: 21
 *  points across the bracketing cell of an edge, or a sub-grid of the cell
 *  around a ternary one.  Returned with the index range each one owns. */
export function refinementPlan(f: RcmField, sps: readonly SingularPoint[]):
  { points: Vec3[]; owners: { sp: number; from: number; to: number }[] } {
  const points: Vec3[] = [];
  const owners: { sp: number; from: number; to: number }[] = [];
  const h = 1 / f.n;
  sps.forEach((sp, k) => {
    const from = points.length;
    if (sp.kind === "binary azeotrope" && sp.edge) {
      const [a, b] = sp.edge;
      const s0 = Math.max(0, sp.x[a]! - h), s1 = Math.min(1, sp.x[a]! + h);
      for (let m = 0; m < REFINE_EDGE_POINTS; m++) {
        const s = s0 + (m / (REFINE_EDGE_POINTS - 1)) * (s1 - s0);
        points.push(edgePoint(a, b, s));
      }
    } else if (sp.kind === "ternary azeotrope") {
      //  A triangle of side 2h centred on the coarse zero, divided into
      //  REFINE_CELL_DIV^2 sub-cells.
      const c: Vec2 = [sp.x[0] - (2 / 3) * h, sp.x[1] - (2 / 3) * h];
      const m = REFINE_CELL_DIV;
      for (let i = 0; i <= m; i++)
        for (let j = 0; j <= m - i; j++)
          points.push(full([c[0] + (2 * h * i) / m, c[1] + (2 * h * j) / m]));
    } else return;
    owners.push({ sp: k, from, to: points.length });
  });
  return { points, owners };
}

/** Sharpen each azeotrope from the refinement run's points.  A point whose
 *  refinement does not bracket a zero keeps its coarse location, unchanged
 *  and still marked unrefined. */
export function applyRefinement(
  f: RcmField, sps: readonly SingularPoint[], plan: ReturnType<typeof refinementPlan>,
  refined: readonly (RefinedPoint | null)[],
): SingularPoint[] {
  const out = sps.map((s) => ({ ...s }));
  const h = 1 / f.n;
  for (const o of plan.owners) {
    const sp = out[o.sp]!;
    const pts = refined.slice(o.from, o.to);
    if (sp.kind === "binary azeotrope" && sp.edge) {
      const a = sp.edge[0];
      for (let m = 0; m + 1 < pts.length; m++) {
        const p = pts[m], q = pts[m + 1];
        if (!p || !q) continue;
        const gp = p.y[a]! - p.x[a]!, gq = q.y[a]! - q.x[a]!;
        if (gp * gq <= 0 && gp !== gq) {
          const t = gp / (gp - gq);
          sp.x = [0, 1, 2].map((c) => p.x[c]! + t * (q.x[c]! - p.x[c]!)) as Vec3;
          sp.T = p.T + t * (q.T - p.T);
          sp.resolution = (2 * h) / (REFINE_EDGE_POINTS - 1);
          sp.refined = true;
          Object.assign(sp, classify(f, [sp.x[0], sp.x[1]], sp.T));
          break;
        }
      }
    } else if (sp.kind === "ternary azeotrope") {
      //  The refined points form their own small grid; find the zero of the
      //  linear interpolant cell by cell, as on the coarse grid.
      const m = REFINE_CELL_DIV;
      const idx = (i: number, j: number) => {
        let k = 0;
        for (let a = 0; a < i; a++) k += m - a + 1;
        return k + j;
      };
      let best: { x: Vec3; T: number } | null = null;
      for (let i = 0; i < m && !best; i++)
        for (let j = 0; j < m - i && !best; j++) {
          const cells: [number, number][][] = [[[i, j], [i + 1, j], [i, j + 1]]];
          if (i + j + 2 <= m) cells.push([[i + 1, j + 1], [i, j + 1], [i + 1, j]]);
          for (const cell of cells) {
            const P = cell.map(([a, b]) => pts[idx(a, b)] ?? null);
            if (P.some((p) => !p)) continue;
            const g = P.map((p) => [p!.x[0] - p!.y[0], p!.x[1] - p!.y[1]] as Vec2);
            const m11 = g[0]![0] - g[2]![0], m12 = g[1]![0] - g[2]![0];
            const m21 = g[0]![1] - g[2]![1], m22 = g[1]![1] - g[2]![1];
            const det = m11 * m22 - m12 * m21;
            if (Math.abs(det) < 1e-18) continue;
            const r1 = -g[2]![0], r2 = -g[2]![1];
            const wA = (r1 * m22 - m12 * r2) / det, wB = (m11 * r2 - r1 * m21) / det;
            const wC = 1 - wA - wB;
            if (wA < -1e-9 || wB < -1e-9 || wC < -1e-9) continue;
            const w = [wA, wB, wC];
            const x = [0, 1, 2].map((c) => w.reduce((s, wk, k) => s + wk * P[k]!.x[c]!, 0)) as Vec3;
            const T = w.reduce((s, wk, k) => s + wk * P[k]!.T, 0);
            best = { x, T };
            break;
          }
        }
      if (best) {
        sp.x = best.x; sp.T = best.T;
        sp.resolution = (2 * h) / m;
        sp.refined = true;
        Object.assign(sp, classify(f, [sp.x[0], sp.x[1]], sp.T));
      }
    }
  }
  return out;
}

// ---- integration ---------------------------------------------------------------------

export interface Curve {
  /** Compositions in the order of rising xi (rising boiling temperature). */
  x: Vec3[];
  T: number[];
  /** Index into the singular-point list of the point each end reached, or
   *  null where the integration stopped for another reason (said in `why`). */
  start: number | null;
  end: number | null;
  why: string[];
}

export interface IntegrationOptions {
  /** RK4 step, in mole fraction along the normalised direction. */
  step: number;
  maxSteps: number;
  /** A curve that comes within this distance of a singular point ends there. */
  capture: number;
}

export const defaultIntegration = (f: RcmField): IntegrationOptions =>
  ({ step: 0.25 / f.n, maxSteps: 4 * f.n * 20, capture: 0.6 / f.n });

/** One direction of a residue curve: dx/ds = dir (x - y*)/|x - y*|, RK4.
 *  The direction is normalised so the step is a fixed length in composition;
 *  this changes the parameterisation, not the path.  dir = +1 follows rising
 *  xi (the pot getting heavier), -1 runs the still backwards in time. */
export function halfCurve(
  f: RcmField, start: Vec2, dir: 1 | -1, sps: readonly SingularPoint[],
  opts: IntegrationOptions, ignore: number | null = null,
): { pts: Vec2[]; hit: number | null; why: string } {
  const rhs = (p: Vec2): Vec2 | null => {
    const g = driving(f, p);
    if (!g) return null;
    const m = Math.hypot(g[0], g[1]);
    if (m < 1e-12) return [0, 0];
    return [dir * g[0] / m, dir * g[1] / m];
  };
  const pts: Vec2[] = [start];
  let p = start;
  const hitOf = (q: Vec2): number | null => {
    for (let k = 0; k < sps.length; k++) {
      if (k === ignore) continue;
      const s = sps[k]!;
      //  A residue curve can END only at a node; it passes a saddle by.
      if (s.type === "saddle") continue;
      if (Math.hypot(q[0] - s.x[0], q[1] - s.x[1]) < opts.capture) return k;
    }
    return null;
  };
  for (let n = 0; n < opts.maxSteps; n++) {
    const h = opts.step;
    const k1 = rhs(p);
    if (!k1) return { pts, hit: null, why: "a grid cell the engine did not return" };
    const k2 = rhs(clampSimplex([p[0] + h / 2 * k1[0], p[1] + h / 2 * k1[1]]));
    const k3 = k2 && rhs(clampSimplex([p[0] + h / 2 * k2[0], p[1] + h / 2 * k2[1]]));
    const k4 = k3 && rhs(clampSimplex([p[0] + h * k3[0], p[1] + h * k3[1]]));
    if (!k2 || !k3 || !k4) return { pts, hit: null, why: "a grid cell the engine did not return" };
    const q = clampSimplex([
      p[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      p[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    ]);
    pts.push(q);
    const hit = hitOf(q);
    if (hit !== null) {
      pts.push([sps[hit]!.x[0], sps[hit]!.x[1]]);
      return { pts, hit, why: "reached a singular point" };
    }
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9)
      return { pts, hit: null, why: "stalled where x = y* without a located point" };
    p = q;
  }
  return { pts, hit: null, why: "step limit" };
}

function withT(f: RcmField, ps: readonly Vec2[]): { x: Vec3[]; T: number[] } {
  return {
    x: ps.map(full),
    T: ps.map((p) => fieldAt(f, p[0], p[1])?.T ?? NaN),
  };
}

/** The whole residue curve through `seed`: backwards to where it starts,
 *  forwards to where it ends. */
export function residueCurve(
  f: RcmField, seed: Vec3, sps: readonly SingularPoint[], opts = defaultIntegration(f),
): Curve {
  const s: Vec2 = [seed[0], seed[1]];
  const back = halfCurve(f, s, -1, sps, opts);
  const fwd = halfCurve(f, s, 1, sps, opts);
  const ps = [...back.pts.slice().reverse(), ...fwd.pts.slice(1)];
  return { ...withT(f, ps), start: back.hit, end: fwd.hit, why: [back.why, fwd.why] };
}

/** Seeds spread over the interior, every `1/k` in each direction. */
export function seedGrid(k: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 1; i < k; i++)
    for (let j = 1; j < k - i; j++) out.push([i / k, j / k, (k - i - j) / k]);
  return out;
}

// ---- separatrices, regions -----------------------------------------------------------

export interface Boundary {
  /** The saddle it leaves (index into the singular points). */
  saddle: number;
  curve: Curve;
}

/** The distillation boundaries: from each saddle, the curve that leaves it
 *  along each eigen-direction pointing INTO the triangle -- forwards where
 *  the boiling temperature rises along that direction, backwards where it
 *  falls (it rises along every residue curve).  The edges of the triangle are
 *  residue curves too, and are not repeated here. */
export function separatrices(
  f: RcmField, sps: readonly SingularPoint[], opts = defaultIntegration(f),
): Boundary[] {
  const out: Boundary[] = [];
  const eps = 1.2 * opts.capture + 0.5 / f.n;
  sps.forEach((sp, k) => {
    if (sp.type !== "saddle") return;
    const p: Vec2 = [sp.x[0], sp.x[1]];
    const ev = eigen2(jacobian(f, p) ?? [[0, 0], [0, 0]]);
    if (!ev) return;
    for (const v of ev.vectors) {
      for (const sg of [1, -1] as const) {
        const q: Vec2 = [p[0] + sg * eps * v[0], p[1] + sg * eps * v[1]];
        const x = full(q);
        //  Into the triangle, strictly: a direction along an edge, or out of
        //  the triangle, is not a boundary through the interior.
        if (x.some((c) => c < 0.25 / f.n)) continue;
        const fq = fieldAt(f, q[0], q[1]);
        if (!fq) continue;
        const dir: 1 | -1 = fq.T > sp.T ? 1 : -1;
        const h = halfCurve(f, q, dir, sps, opts, k);
        const path: Vec2[] = [p, ...h.pts];
        const pts = dir === 1 ? path : path.slice().reverse();
        const c = withT(f, pts);
        out.push({
          saddle: k,
          curve: { ...c, start: dir === 1 ? k : h.hit, end: dir === 1 ? h.hit : k,
            why: [h.why] },
        });
      }
    }
  });
  return out;
}

export interface RegionLabel { un: number | null; sn: number | null }

export const regionKey = (r: RegionLabel): string => `${r.un ?? "?"}->${r.sn ?? "?"}`;

/** Which region a composition lies in: the unstable node its residue curve
 *  starts at and the stable node it ends at. */
export function regionOf(
  f: RcmField, x: Vec3, sps: readonly SingularPoint[], opts = defaultIntegration(f),
): RegionLabel {
  const c = residueCurve(f, x, sps, opts);
  return { un: c.start, sn: c.end };
}

export interface RegionSummary { un: number | null; sn: number | null; nodes: number; sample: Vec3 }

/** The regions, by labelling interior seeds. */
export function regionsOf(
  f: RcmField, sps: readonly SingularPoint[], k = 12, opts = defaultIntegration(f),
): RegionSummary[] {
  const m = new Map<string, RegionSummary>();
  for (const s of seedGrid(k)) {
    const r = regionOf(f, s, sps, opts);
    const key = regionKey(r);
    const e = m.get(key);
    if (e) e.nodes++;
    else m.set(key, { ...r, nodes: 1, sample: s });
  }
  return [...m.values()].sort((a, b) => b.nodes - a.nodes);
}

// ---- the lever rule on the triangle ------------------------------------------------

/** Where the ray from `a` through `b` first meets a segment beyond `b`. */
function rayHit(a: Vec2, b: Vec2, segs: readonly [Vec2, Vec2][]): Vec2 | null {
  const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
  let best: { t: number; p: Vec2 } | null = null;
  for (const [p, q] of segs) {
    const e: Vec2 = [q[0] - p[0], q[1] - p[1]];
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-15) continue;
    const w: Vec2 = [p[0] - a[0], p[1] - a[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / den;
    const u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t > 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (!best || t < best.t))
      best = { t, p: [a[0] + t * d[0], a[1] + t * d[1]] };
  }
  return best ? best.p : null;
}

export interface Split {
  name: "direct" | "indirect";
  D: Vec3; B: Vec3;
  /** D/F from the lever rule, |FB| / |DB|. */
  DoverF: number;
}

/** The two limiting splits a simple column can approach from feed F in its
 *  region: the DIRECT split takes the region's unstable node overhead and
 *  puts the bottoms where the mass-balance line through F leaves the region;
 *  the INDIRECT split takes the stable node as bottoms and the distillate at
 *  the other end.  The region is bounded by the triangle's edges and by the
 *  separatrices, drawn as polylines. */
export function limitingSplits(
  F: Vec3, region: RegionLabel, sps: readonly SingularPoint[], bounds: readonly Boundary[],
): Split[] {
  const segs: [Vec2, Vec2][] = [
    [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[1, 0], [0, 1]],
  ];
  for (const b of bounds)
    for (let k = 0; k + 1 < b.curve.x.length; k++) {
      const p = b.curve.x[k]!, q = b.curve.x[k + 1]!;
      segs.push([[p[0], p[1]], [q[0], q[1]]]);
    }
  const f2: Vec2 = [F[0], F[1]];
  const lever = (D: Vec2, B: Vec2): number => {
    const db = Math.hypot(D[0] - B[0], D[1] - B[1]);
    return Math.hypot(f2[0] - B[0], f2[1] - B[1]) / db;
  };
  const out: Split[] = [];
  if (region.un !== null) {
    const D: Vec2 = [sps[region.un]!.x[0], sps[region.un]!.x[1]];
    const B = rayHit(D, f2, segs);
    if (B) out.push({ name: "direct", D: full(D), B: full(B), DoverF: lever(D, B) });
  }
  if (region.sn !== null) {
    const B: Vec2 = [sps[region.sn]!.x[0], sps[region.sn]!.x[1]];
    const D = rayHit(B, f2, segs);
    if (D) out.push({ name: "indirect", D: full(D), B: full(B), DoverF: lever(D, B) });
  }
  return out;
}

// ---- checks the page states about its own drawing ------------------------------------

/** The largest DROP in boiling temperature between consecutive points of a
 *  curve, in K (0 or less when T only rises). */
export function largestTDrop(c: Curve): number {
  let worst = 0;
  for (let k = 1; k < c.T.length; k++) {
    const d = c.T[k - 1]! - c.T[k]!;
    if (Number.isFinite(d) && d > worst) worst = d;
  }
  return worst;
}

function segIntersect(p: Vec3, q: Vec3, r: Vec3, s: Vec3): boolean {
  const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [s[0] - r[0], s[1] - r[1]];
  const den = d1[0]! * d2[1]! - d1[1]! * d2[0]!;
  if (Math.abs(den) < 1e-18) return false;
  const w = [r[0] - p[0], r[1] - p[1]];
  const t = (w[0]! * d2[1]! - w[1]! * d2[0]!) / den;
  const u = (w[0]! * d1[1]! - w[1]! * d1[0]!) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

/** Whether two curves cross, ignoring a neighbourhood of every singular point
 *  (where curves meet by construction, at the node they share). */
export function curvesCross(
  a: Curve, b: Curve, sps: readonly SingularPoint[], exclude: number,
): boolean {
  const near = (x: Vec3) => sps.some((s) => Math.hypot(x[0] - s.x[0], x[1] - s.x[1]) < exclude);
  for (let i = 0; i + 1 < a.x.length; i++) {
    if (near(a.x[i]!) || near(a.x[i + 1]!)) continue;
    for (let j = 0; j + 1 < b.x.length; j++) {
      if (near(b.x[j]!) || near(b.x[j + 1]!)) continue;
      if (segIntersect(a.x[i]!, a.x[i + 1]!, b.x[j]!, b.x[j + 1]!)) return true;
    }
  }
  return false;
}
