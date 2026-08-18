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
  hunterNash — the READING and the GEOMETRY behind the ternary tie-triangle
  EduTool.  No React, no plotting kit: pure functions over engine output, so
  the node test runner can pin every one of them without a DOM.

  TWO ENGINE SURFACES, and nothing else feeds the picture.

    1. `propertyScanTernary` in `mode lle` writes
          x1,x2,x3,region,region_id,kind,tieline_id,beta_vapor,beta_alpha,beta_beta
       — one `node` row per simplex grid point carrying the flash's own phase
       CLASSIFICATION and phase fractions, plus `tie` rows in PAIRS (two rows
       sharing a `tieline_id`) whose two compositions ARE the two coexisting
       liquids the Gibbs-minimisation flash found.  Every one of those numbers
       is a converged flash; this module parses them and does not touch them.

    2. `extractor` publishes the cascade: the per-stage profile
          stage, F_extract, F_raffinate, xE_<comp>, xR_<comp>
       whose (xR_j, xE_j) pair IS the tie-line of stage j — the same
       IsothermalFlash kernel, at the composition the cascade actually
       reached — plus the KPI block (F_feed, F_solvent, F_extract,
       F_raffinate, stages, …) and the run's own stream compositions.

  WHAT THIS MODULE COMPUTES, and why each item is view geometry rather than
  physics.  The Hunter-Nash construction IS the lesson, exactly as
  McCabe-Thiele's staircase is: it is a ruler-and-pencil argument over points
  somebody else measured.  Three operations, each labelled where it happens:

    * `project` — barycentric (x1,x2,x3) onto a plane triangle.  An affine
      map; it moves no number, it only chooses where the paper is.
    * `lineIntersection` — where two straight lines through four published
      points cross.  This is how the MIXING point M and the DIFFERENCE point
      Δ are located, and locating them by intersection rather than by
      arithmetic is deliberate: the intersection is the construction the
      student is being taught to draw.
    * `pointLineDistance` — how far a published point falls off a constructed
      line.  This is the FALSIFIER: the Hunter-Nash claim is that Δ, R_j and
      E_{j+1} are colinear, and the engine's own R_j and E_{j+1} either lie on
      that line or they do not.

  WHAT THIS MODULE REFUSES TO COMPUTE, stated because the absence is the
  contract:

    * NO equilibrium, no flash, no activity coefficient, no K value.
    * NO INTERPOLATED TIE-LINE.  The classical hand construction steps from a
      raffinate composition to the conjugate extract by reading a tie-line off
      the chart — interpolating between the plotted ones.  A tie-line at a
      composition the engine did not solve is a composition nobody solved, so
      this module never produces one.  Consequence, stated rather than worked
      around: the tool cannot COUNT stages graphically for a duty the cascade
      did not run; it steps on the cascade's own stages.  Closing that gap is
      an ENGINE slice (a props op that returns the tie-line through a GIVEN
      composition), not a view slice.
    * NO BINODAL CURVE.  The scan publishes tie-line ENDS (which lie on the
      binodal) and a node classification; it does not publish the curve.  A
      polyline joining the ends would be a curve this view invented between
      them — and near the plait point, where the published splits are
      shallowest, it would be inventing exactly where it is least entitled to.
    * NO PLAIT POINT, no spinodal, no critical composition: none is published.
\*---------------------------------------------------------------------------*/

import type { StreamResult, UnitProfile } from "../adapters/SolverAdapter.js";

/** A ternary composition in the CSV's own component order (x1, x2, x3). */
export type Tri = readonly [number, number, number];

/** A point on the drawn triangle. */
export interface Pt { x: number; y: number }

/** Per-unit KPI block as the adapter delivers it (RunResult.kpis[unit]). */
export type KpiRow = { [key: string]: number };
export type KpiMap = { [unitName: string]: KpiRow };

// ---- The witnesses ----------------------------------------------------------
// The standalone feed (the Methods-workspace contract): the tool runs its OWN
// sealed tutorials in the browser rather than depending on whatever case
// happens to be open.  TWO witnesses, because the construction needs a MAP and
// a COLUMN, and they are only comparable because they are the same system:
// their `constant/thermoPhysPropDict` files differ ONLY in the two liquid-phase
// NAMES and a `vapour { fugacityModel idealGas; }` block the LL scan never
// reaches, and their sealed `constant/components/*.dat` and
// `constant/parameters/UNIFAC/**` records are byte-identical.  Both facts are
// pinned by tests/hunterNash.test.ts — a later edit to one dict must not be
// allowed to make this picture a lie.

/** The tie-triangle: propertyScanTernary, `mode lle`, 298.15 K, 1 bar. */
export const MAP_WITNESS = "props/scan/ternary03_lle_water_ethanol_benzene";
/** The cascade: a 5-stage counter-current extractor at the SAME T. */
export const COLUMN_WITNESS = "steady/absorption/extract01_ethanol_water_benzene";

/** The file the map witness's propsDict declares as its output. */
export const MAP_CSV = "ternary.csv";

/** The component order BOTH witnesses declare in `components ( … )` — which is
 *  therefore the (x1, x2, x3) order of the scan CSV.  Pinned against the raw
 *  dicts by the test suite; the profile columns are name-keyed (`xE_<comp>`)
 *  and carry no such risk. */
export const WITNESS_COMPONENTS = ["water", "ethanol", "benzene"] as const;

/** The three ROLES, as the witnesses' own dicts declare them: the extractor's
 *  `solvent benzene;` key, the feed stream that carries water + ethanol, and
 *  the solute the engine then reports as `soluteRecovery`.  Declared here and
 *  pinned by the test suite rather than sniffed at run time — a role read off
 *  a composition would be a guess about which stream meant what. */
export const WITNESS_CARRIER = "water";
export const WITNESS_SOLUTE = "ethanol";
export const WITNESS_SOLVENT = "benzene";

// ---- View geometry 1: the projection ----------------------------------------
// Barycentric -> plane, with the corners CHOSEN so the diagram reads the way
// the textbook draws it: carrier bottom-left, solvent bottom-right, solute at
// the apex.  The choice is declared (a permutation of the CSV's own component
// order) rather than hidden inside the projector, because a ternary diagram
// whose corners are not named is unreadable and one whose corners are named
// wrongly is worse.

const VA: Pt = { x: 0, y: 0 };
const VB: Pt = { x: 1, y: 0 };
const VC: Pt = { x: 0.5, y: Math.sqrt(3) / 2 };

/** The three drawn corners, in the order `cornerOrder` returns indices for. */
export const CORNERS: readonly [Pt, Pt, Pt] = [VA, VB, VC];

/** Indices into the CSV triple for [bottom-left, bottom-right, apex].
 *  Throws when a named role is not among the components — a corner that names
 *  a component the scan does not carry cannot be drawn, and drawing it under
 *  the wrong name is the failure this refusal exists to prevent. */
export function cornerOrder(
  components: readonly string[],
  roles: readonly [string, string, string],
): [number, number, number] {
  const idx = roles.map((r) => {
    const i = components.indexOf(r);
    if (i < 0)
      throw new Error(`cornerOrder: '${r}' is not among the scan's components `
        + `(${components.join(", ")})`);
    return i;
  });
  return [idx[0]!, idx[1]!, idx[2]!];
}

/** Barycentric composition -> the drawn triangle, side 1.  Every distance this
 *  module reports is in THESE units: 1.0 is one triangle edge. */
export function project(x: Tri, order: readonly [number, number, number]): Pt {
  const a = x[order[0]]!, b = x[order[1]]!, c = x[order[2]]!;
  return {
    x: a * VA.x + b * VB.x + c * VC.x,
    y: a * VA.y + b * VB.y + c * VC.y,
  };
}

/** How far a composition is from summing to one.  Reported, never repaired:
 *  a composition that does not close is a fact about the run. */
export function closureGap(x: Tri): number {
  return Math.abs(x[0] + x[1] + x[2] - 1);
}

// ---- View geometry 2: straight lines through published points ---------------

/** Where line (p1 p2) meets line (p3 p4).  Null when they are parallel within
 *  `eps` — a construction that would place a point at infinity reports that it
 *  cannot, rather than returning a very large number that looks like an
 *  answer. */
export function lineIntersection(
  p1: Pt, p2: Pt, p3: Pt, p4: Pt, eps = 1e-12,
): Pt | null {
  const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (!Number.isFinite(den) || Math.abs(den) < eps) return null;
  const a = p1.x * p2.y - p1.y * p2.x;
  const b = p3.x * p4.y - p3.y * p4.x;
  return {
    x: (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / den,
    y: (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / den,
  };
}

/** Perpendicular distance from `p` to the line through `a` and `b`, in
 *  triangle-edge units.  Null when a and b coincide (there is no line). */
export function pointLineDistance(p: Pt, a: Pt, b: Pt, eps = 1e-12): number | null {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len = Math.hypot(vx, vy);
  if (!Number.isFinite(len) || len < eps) return null;
  return Math.abs(vx * (p.y - a.y) - vy * (p.x - a.x)) / len;
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---- Engine surface 1: the ternary scan CSV ---------------------------------

export interface ScanNode {
  x: Tri;
  /** The engine's own classification word: ONE_PHASE / VL / LL / VLLE. */
  region: string;
  /** The two liquid phase fractions the flash reported at this node. */
  betaAlpha: number;
  betaBeta: number;
}

export interface ScanTie {
  id: number;
  ends: readonly [Tri, Tri];
}

export interface ScanRead {
  nodes: ScanNode[];
  ties: ScanTie[];
  /** Rows the reader could not use (wrong field count, unparseable numbers).
   *  Surfaced by the tool: a silently dropped row is a hole in the picture. */
  skippedRows: number;
  /** `tieline_id` groups that did not come in pairs.  A tie-line is TWO
   *  compositions; one of them alone is not half a tie-line, it is nothing. */
  unpairedTies: number;
  /** The smallest MINOR phase fraction among the published two-liquid nodes,
   *  and how many nodes sit at it.  A pure reduction of engine output, and the
   *  honest way to say how shallow the shallowest published split is — no
   *  threshold is invented and nothing is filtered on it. */
  minorBetaMin: number | null;
  minorBetaMinCount: number;
}

const TIE_HEADER = "x1,x2,x3,region,region_id,kind,tieline_id,"
  + "beta_vapor,beta_alpha,beta_beta";

/** Parse the phase-map CSV.  Returns a refusal string instead of a reading
 *  when the header is not the phase map — the same op also writes a
 *  scalar-surface shape (`mode bubbleT`), and drawing tie-lines over a bubble
 *  temperature surface would be a category error, not a rendering bug. */
export function readTernaryScan(
  csv: string,
): { ok: true; read: ScanRead } | { ok: false; why: string } {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2)
    return { ok: false, why: "the scan CSV is empty" };
  const header = lines[0]!.split(",").map((s) => s.trim());
  if (header.join(",") !== TIE_HEADER)
    return {
      ok: false,
      why: "this CSV is not a propertyScanTernary PHASE MAP (its header is "
        + `'${header.join(",")}'; the tie-triangle needs '${TIE_HEADER}', `
        + "which `mode lle` writes)",
    };

  const nodes: ScanNode[] = [];
  const byTie = new Map<number, Tri[]>();
  let skippedRows = 0;
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== header.length) { ++skippedRows; continue; }
    const x1 = Number(c[0]), x2 = Number(c[1]), x3 = Number(c[2]);
    if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(x3)) {
      ++skippedRows; continue;
    }
    const x: Tri = [x1, x2, x3];
    const kind = (c[5] ?? "").trim();
    if (kind === "node") {
      nodes.push({
        x, region: (c[3] ?? "").trim(),
        betaAlpha: Number(c[8]), betaBeta: Number(c[9]),
      });
    } else if (kind === "tie") {
      const id = Number(c[6]);
      if (!Number.isFinite(id)) { ++skippedRows; continue; }
      const bucket = byTie.get(id);
      if (bucket) bucket.push(x); else byTie.set(id, [x]);
    } else {
      ++skippedRows;
    }
  }

  const ties: ScanTie[] = [];
  let unpairedTies = 0;
  for (const [id, ends] of [...byTie.entries()].sort((a, b) => a[0] - b[0])) {
    if (ends.length === 2) ties.push({ id, ends: [ends[0]!, ends[1]!] });
    else ++unpairedTies;
  }

  // The shallowest published split, as a pure minimum over the engine's own
  // beta columns.  Two-liquid nodes only: a one-phase node's betas describe
  // no split.
  let minorBetaMin: number | null = null;
  let minorBetaMinCount = 0;
  for (const n of nodes) {
    if (n.region !== "LL" && n.region !== "VLLE") continue;
    if (!Number.isFinite(n.betaAlpha) || !Number.isFinite(n.betaBeta)) continue;
    const minor = Math.min(n.betaAlpha, n.betaBeta);
    if (minorBetaMin === null || minor < minorBetaMin) {
      minorBetaMin = minor; minorBetaMinCount = 1;
    } else if (minor === minorBetaMin) {
      ++minorBetaMinCount;
    }
  }

  return {
    ok: true,
    read: { nodes, ties, skippedRows, unpairedTies, minorBetaMin, minorBetaMinCount },
  };
}

// ---- Engine surface 2: the cascade ------------------------------------------

export interface StageTie {
  /** 1-based, as the engine numbers it: stage 1 takes the feed, stage N the
   *  fresh solvent. */
  stage: number;
  raffinate: Tri;
  extract: Tri;
}

export interface ExtractorFeed {
  unit: string;
  kpis: KpiRow;
  stages: StageTie[];
}

const TERMINAL_KPIS = ["F_feed", "F_solvent", "F_extract", "F_raffinate"] as const;

/** Profiles that carry the extraction cascade: a `stage` axis plus an
 *  `xE_<comp>` and `xR_<comp>` column for EVERY component, alongside a KPI
 *  block carrying the four terminal flows.  Column presence is the contract,
 *  never a unit or case name (the Merkel posture) — a distillation profile also
 *  has a `stage` axis and cannot be mistaken for this one, because it carries
 *  no xE_/xR_ pair. */
export function findExtractorFeeds(
  profiles: UnitProfile[] | undefined,
  kpis: KpiMap | undefined,
  components: readonly string[],
): ExtractorFeed[] {
  if (!profiles) return [];
  const out: ExtractorFeed[] = [];
  for (const p of profiles) {
    const row = kpis?.[p.unit];
    if (!row) continue;
    if (!TERMINAL_KPIS.every((k) => Number.isFinite(row[k]))) continue;
    const stages = readStageTies(p, components);
    if (stages.length === 0) continue;
    out.push({ unit: p.unit, kpis: row, stages });
  }
  return out.sort((a, b) => a.unit.localeCompare(b.unit));
}

/** The per-stage tie-lines, straight off the profile.  Empty when any column
 *  is missing or short — a partial cascade would draw a staircase with an
 *  invisible gap in it. */
export function readStageTies(
  profile: UnitProfile, components: readonly string[],
): StageTie[] {
  const stage = profile.columns["stage"];
  if (!stage || stage.length === 0) return [];
  const cols = (prefix: string) => components.map((c) => profile.columns[prefix + c]);
  const xE = cols("xE_"), xR = cols("xR_");
  if (xE.some((c) => !c || c.length !== stage.length)) return [];
  if (xR.some((c) => !c || c.length !== stage.length)) return [];
  const out: StageTie[] = [];
  for (let j = 0; j < stage.length; ++j) {
    const e = xE.map((c) => c![j]!) as unknown as Tri;
    const r = xR.map((c) => c![j]!) as unknown as Tri;
    if (![...e, ...r].every((v) => Number.isFinite(v))) return [];
    out.push({ stage: stage[j]!, raffinate: r, extract: e });
  }
  return out;
}

export interface Terminal {
  name: string;
  x: Tri;
  /** Overall molar flow as published [kmol/s]. */
  F: number;
}

/** Bind the two INLET streams to the cascade's own terminal flows.
 *
 *  By FLOW, not by name: the extractor publishes F_feed and F_solvent as KPIs,
 *  and the run publishes each stream's F, so the binding is a match between two
 *  numbers the engine wrote.  A name match would work on this witness and
 *  quietly stop working on any other case, and a "the solvent is the pure one"
 *  rule would be a guess dressed as a reading.  Ambiguity refuses. */
export function bindInlets(
  streams: readonly StreamResult[] | undefined,
  kpis: KpiRow,
  components: readonly string[],
): { ok: true; feed: Terminal; solvent: Terminal } | { ok: false; why: string } {
  if (!streams || streams.length === 0)
    return { ok: false, why: "the run published no streams" };
  const inlets = streams.filter((s) => s.role === "feed");
  if (inlets.length < 2)
    return {
      ok: false,
      why: `the run published ${inlets.length} inlet stream(s); the `
        + "construction needs the feed AND the fresh solvent",
    };
  const pick = (target: number | undefined, what: string):
    { ok: true; hit: StreamResult } | { ok: false; why: string } => {
    if (target === undefined || !Number.isFinite(target))
      return { ok: false, why: `the cascade published no ${what} flow` };
    const hits = inlets.filter(
      (s) => Number.isFinite(s.F) && Math.abs(s.F - target) <= 1e-9 * Math.abs(target));
    if (hits.length === 0)
      return { ok: false, why: `no inlet stream carries the ${what} flow the `
        + `cascade reported (${target} kmol/s)` };
    if (hits.length > 1)
      return { ok: false, why: `${hits.length} inlet streams carry the same flow `
        + `as the ${what} (${target} kmol/s), so which is which is not `
        + "decidable from published numbers" };
    return { ok: true, hit: hits[0]! };
  };
  const f = pick(kpis["F_feed"], "feed");
  if (!f.ok) return { ok: false, why: f.why };
  const s = pick(kpis["F_solvent"], "solvent");
  if (!s.ok) return { ok: false, why: s.why };
  if (f.hit.name === s.hit.name)
    return { ok: false, why: "the feed and the solvent bound to the same "
      + `stream ('${f.hit.name}') — their flows are equal in this run` };
  const asTri = (st: StreamResult): Tri =>
    components.map((c) => st.composition[c] ?? 0) as unknown as Tri;
  return {
    ok: true,
    feed: { name: f.hit.name, x: asTri(f.hit), F: f.hit.F },
    solvent: { name: s.hit.name, x: asTri(s.hit), F: s.hit.F },
  };
}

// ---- The construction -------------------------------------------------------
// Hunter-Nash, over the cascade's own points.  The material balance around
// stages 1..j reads  F + E_{j+1} = R_j + E_1, so the DIFFERENCE
//      Δ ≡ F − E_1 = R_j − E_{j+1} = R_N − S
// is the same net stream at every cut.  On the triangle that says: Δ, R_j and
// E_{j+1} are colinear for every j — one point through which every operating
// line passes.  That is the whole method, and it is a CLAIM, so this module
// measures it.

export interface OperatingLeg {
  /** The cut: between stage j and stage j+1. */
  stage: number;
  /** The raffinate leaving stage j (engine). */
  raffinate: Pt;
  /** The extract arriving from stage j+1 — the engine's own E_{j+1}, or the
   *  fresh solvent S at the last cut. */
  partner: Pt;
  /** Perpendicular distance of `partner` from the line (Δ, R_j), in
   *  triangle-edge units.  Null when the line degenerates. */
  residual: number | null;
  /** True for the cut that DEFINED Δ.  It closes exactly, by construction,
   *  and is therefore not evidence of anything. */
  byConstruction: boolean;
}

export interface Construction {
  order: [number, number, number];
  /** The four terminal points, projected. */
  F: Pt; S: Pt; E1: Pt; RN: Pt;
  /** Δ, the difference point.  Null when the two defining lines are parallel
   *  within tolerance (F−E1 and RN−S then carry no common intersection: the
   *  net stream is at infinity, which happens when the two operating lines are
   *  genuinely parallel and is a real, drawable configuration — the method's
   *  degenerate case, reported rather than approximated). */
  delta: Pt | null;
  /** The mixing point, located as the crossing of (F,S) with (E1,RN) —
   *  the construction. */
  mixingGeometric: Pt | null;
  /** The mixing point from the published FLOWS: (F·z_F + S·z_S)/(F+S).
   *  Arithmetic on engine numbers, and an INDEPENDENT determination of the
   *  same point — the lever rule made falsifiable. */
  mixingLever: Pt;
  /** Distance between the two, in triangle-edge units.  Null when the lines
   *  did not cross. */
  mixingGap: number | null;
  legs: OperatingLeg[];
  /** Compositions whose three fractions did not sum to 1 within 1e-6, named.
   *  Reported, never repaired. */
  openCompositions: string[];
}

/** Build the construction from the cascade's published points.  `stages` must
 *  be in stage order (1..N) as the profile publishes them. */
export function buildConstruction(
  feed: Terminal, solvent: Terminal, stages: readonly StageTie[],
  order: [number, number, number],
): { ok: true; construction: Construction } | { ok: false; why: string } {
  if (stages.length < 1)
    return { ok: false, why: "the cascade published no stages" };
  const N = stages.length;
  const E1x = stages[0]!.extract;
  const RNx = stages[N - 1]!.raffinate;

  const open: string[] = [];
  const check = (label: string, x: Tri) => {
    if (closureGap(x) > 1e-6) open.push(`${label} (Σx − 1 = ${(x[0] + x[1] + x[2] - 1).toExponential(2)})`);
  };
  check("feed", feed.x); check("solvent", solvent.x);
  check("E₁", E1x); check(`R_${N}`, RNx);

  const P = (x: Tri) => project(x, order);
  const F = P(feed.x), S = P(solvent.x), E1 = P(E1x), RN = P(RNx);

  const delta = lineIntersection(F, E1, RN, S);
  const mixingGeometric = lineIntersection(F, S, E1, RN);
  const total = feed.F + solvent.F;
  if (!(total > 0))
    return { ok: false, why: "the two inlet flows sum to zero" };
  const mixTri: Tri = [0, 1, 2].map(
    (i) => (feed.F * feed.x[i]! + solvent.F * solvent.x[i]!) / total,
  ) as unknown as Tri;
  const mixingLever = P(mixTri);

  const legs: OperatingLeg[] = [];
  if (delta) {
    for (let j = 0; j < N; ++j) {
      const R = P(stages[j]!.raffinate);
      const partner = j + 1 < N ? P(stages[j + 1]!.extract) : S;
      legs.push({
        stage: stages[j]!.stage,
        raffinate: R,
        partner,
        residual: pointLineDistance(partner, delta, R),
        // The last cut is R_N − S, one of the two lines Δ was built from.
        byConstruction: j + 1 >= N,
      });
    }
  }

  return {
    ok: true,
    construction: {
      order, F, S, E1, RN, delta, mixingGeometric, mixingLever,
      mixingGap: mixingGeometric ? distance(mixingGeometric, mixingLever) : null,
      legs, openCompositions: open,
    },
  };
}

/** The largest residual among the legs that are NOT true by construction —
 *  the one number that says whether the method's colinearity claim survived
 *  contact with the rigorous cascade.  Null when there is no such leg (a
 *  one-stage column: every cut defined Δ). */
export function worstResidual(c: Construction): number | null {
  let worst: number | null = null;
  for (const leg of c.legs) {
    if (leg.byConstruction || leg.residual === null) continue;
    if (worst === null || leg.residual > worst) worst = leg.residual;
  }
  return worst;
}

// ---- The classroom knobs ----------------------------------------------------
// Engine-side levers only: each writes a NUMBER into a scalar the witness's own
// dict declares, and `applyScalarOverride` throws rather than miss.

export interface KnobTarget { witness: string; file: string }

export interface TieTriangleKnob {
  id: string;
  label: string;
  /** The dict key as written in the target file. */
  key: string;
  /** The witness's own authored value — the classroom default. */
  def: number;
  min: number;
  max: number;
  step: number;
  /** The unit word the dict declares ("" when the dict declares it bare).
   *  The override writes the number only; the unit survives untouched. */
  unit: string;
  targets: readonly KnobTarget[];
  /** One line the student reads: what turning this changes.  Named `why` to
   *  match the shared panel's structural `PanelKnob` contract, so the knob
   *  descriptor is handed to `KnobSlider` whole rather than re-shaped. */
  why: string;
}

export const TIE_TRIANGLE_KNOBS: readonly TieTriangleKnob[] = [
  { id: "stages", label: "theoretical stages N", key: "stages",
    def: 5, min: 1, max: 12, step: 1, unit: "",
    targets: [{ witness: COLUMN_WITNESS, file: "system/flowsheetDict" }],
    why: "How many equilibrium contacts the cascade gets — one more stage "
      + "is one more tie-line on the staircase." },
  { id: "solvent", label: "solvent rate S", key: "benzene",
    def: 120, min: 20, max: 400, step: 10, unit: "kmol/h",
    targets: [{ witness: COLUMN_WITNESS, file: "0/solvent" }],
    why: "Moves the mixing point M along the F–S line, which swings the "
      + "difference point Δ and re-aims every operating line." },
  { id: "feedSolute", label: "feed ethanol", key: "ethanol",
    def: 20, min: 1, max: 60, step: 1, unit: "kmol/h",
    targets: [{ witness: COLUMN_WITNESS, file: "0/feed" }],
    why: "Where F sits on the carrier–solute edge." },
  { id: "feedCarrier", label: "feed water", key: "water",
    def: 80, min: 20, max: 200, step: 5, unit: "kmol/h",
    targets: [{ witness: COLUMN_WITNESS, file: "0/feed" }],
    why: "The other half of F's position on that edge." },
  { id: "tieStride", label: "map: publish every nth tie-line", key: "tieStride",
    def: 4, min: 1, max: 12, step: 1, unit: "",
    targets: [{ witness: MAP_WITNESS, file: "system/propsDict" }],
    why: "How many of the scan's split nodes emit their tie-line.  It "
      + "changes what the engine PUBLISHES, never what it computes." },
];

export type TieTriangleKnobValues = { [id: string]: number };

export function defaultKnobValues(): TieTriangleKnobValues {
  const out: TieTriangleKnobValues = {};
  for (const k of TIE_TRIANGLE_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values -> the ScalarOverrides ONE witness receives.  Non-finite values
 *  are dropped (that knob keeps the witness's authored number), never written
 *  as NaN. */
export function knobOverridesFor(
  values: TieTriangleKnobValues, witness: string,
): { file: string; key: string; value: number }[] {
  const out: { file: string; key: string; value: number }[] = [];
  for (const k of TIE_TRIANGLE_KNOBS) {
    const v = values[k.id];
    if (v === undefined || !Number.isFinite(v)) continue;
    for (const t of k.targets)
      if (t.witness === witness) out.push({ file: t.file, key: k.key, value: v });
  }
  return out;
}

/* THE KNOB THAT IS REFUSED, and why it is a refusal rather than a gap.
 *
 *  Stated here as prose and ENFORCED in tests/hunterNash.test.ts, which fires
 *  the real override at both keys.  There is deliberately no exported list of
 *  refused names: a list nothing reads is a comment wearing a type, and the
 *  claim already has one home.
 *
 *  The column's `temperature 298.15 K;` IS addressable by the override grammar.
 *  The map's is not: `state { T 298.15 K;  P 1 bar; }` is an INLINE sub-dict,
 *  and the line-anchored `key value [unit];` grammar cannot reach a key that is
 *  not at the start of its line.  So a temperature knob would move the column
 *  and leave the triangle where it was — stage points of one temperature drawn
 *  on the map of another, with nothing on screen to say so.  The two runs must
 *  share their T or the picture is a lie, so there is no T knob.
 *
 *  The same sentence covers the scan's `grid { n 16; }`: inline, unreachable,
 *  and the map's resolution therefore stays as authored.
 *
 *  Both absences are pinned by the test suite (applyScalarOverride throws on
 *  them), so the day a dict reformat or a grammar extension makes them
 *  addressable, the justification is re-examined rather than inherited. */
