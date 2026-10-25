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
  bund -- the arithmetic of "Secondary containment: designing a bund"
  (DEV.md 4c C136, Vitor's specification of 2026-10-21).  Pure functions of
  numbers: no React, no plotting, no engine run, so the test loads it alone.

  TWO LAYERS, KEPT APART ON PURPOSE.

  (1) THE ENGINE'S ARITHMETIC, mirrored function by function.  Choupo's
      layout check (src/postProcessing/layout/PlantLayout.cpp, readBunds)
      computes a bund's net volume and its required volume through
      src/postProcessing/layout/BundArithmetic.H; the seven functions under
      "THE ENGINE'S TWIN" below are that header's, one for one, and
      bin/curate/check_bund_arithmetic.py compiles a probe against the header
      and requires it to reproduce the numbers gui/tests/bund.test.ts pins
      for them.  `engineCheck` is the layout check's verdict on a bund of
      standing tanks: area x wall height, less EVERY enclosed footprint below
      the wall top, against the largest of the rule's terms plus the rain.

  (2) WHAT THE PAGE TEACHES BEYOND THE ENGINE, each said on the page too: a
      floor that falls to a sump, a freeboard, the LEVEL a spill reaches,
      the useful capacity that leaves the failing tank's own footprint
      undeducted (HSE HSG176 para 157 asks for the space of the OTHER tanks,
      and mass conservation says why), and four scenarios integrated in time
      with every cubic metre accounted for.  With a flat floor, no freeboard
      and no rain, the useful capacity differs from the engine's net volume
      by exactly the failing tank's footprint times the wall height (bounded
      by its own height): the engine is on the safe side by that much, never
      on the other.

  WHAT IS NOT MODELLED, and the page says so: the wave a catastrophic
  failure throws at the wall, foam, evaporation, the fire-fighting water's
  volume, the drain's real hydraulics (one orifice, one coefficient), a
  tank's floating, and every structural design.
\*---------------------------------------------------------------------------*/

// ---- Constants ------------------------------------------------------------------

/** Standard gravity [m/s2], the conventional value. */
export const G_N = 9.80665;

/** The discharge coefficient of the drain's opening, taken as a sharp-edged
 *  orifice's round number.  The page's assumption, a knob, never a datum. */
export const DRAIN_CD = 0.61;

/** The page's rain depth for the second exercise [m]: an author-set round
 *  number, NOT a design rainfall (the site's own statistics and the
 *  applicable guidance set that), exactly as the layout witnesses say. */
export const EXERCISE_RAIN_M = 0.05;

// ---- THE ENGINE'S TWIN (BundArithmetic.H, function for function) --------------

/** A standing cylinder (vertical axis), diameter D, base at z above grade,
 *  height H: the volume it occupies between grade and the level h.
 *  Twin of bundMath::displacedStanding. */
export function displacedStanding(D: number, z: number, H: number, h: number): number {
  const lo = Math.max(0.0, z), hi = Math.min(h, z + H);
  if (hi <= lo) return 0.0;
  return 0.25 * Math.PI * D * D * (hi - lo);
}

/** A lying cylinder, diameter D, axial length Lax, bottom at z: the circular
 *  segment below the level, times its length.  Twin of
 *  bundMath::displacedLying. */
export function displacedLying(D: number, Lax: number, z: number, h: number): number {
  const lo = Math.max(0.0, z), hi = Math.min(h, z + D);
  if (hi <= lo) return 0.0;
  const R = 0.5 * D;
  const seg = (t: number): number => {
    t = Math.max(0.0, Math.min(D, t));
    return R * R * Math.acos((R - t) / R)
      - (R - t) * Math.sqrt(Math.max(0.0, 2.0 * R * t - t * t));
  };
  return Lax * (seg(hi - z) - seg(lo - z));
}

/** A box footprint dx x dy, base at z, height dz.  Twin of
 *  bundMath::displacedBox. */
export function displacedBox(dx: number, dy: number, z: number, dz: number, h: number): number {
  const lo = Math.max(0.0, z), hi = Math.min(h, z + dz);
  if (hi <= lo) return 0.0;
  return dx * dy * (hi - lo);
}

/** The GEOMETRIC volume of a flat floor and its wall.  Twin of
 *  bundMath::grossVolume. */
export function grossVolume(area: number, wallHeight: number): number {
  return area * wallHeight;
}

/** One term of a capacity rule.  Twin of bundMath::termVolume. */
export function termVolume(fraction: number, ofLargest: boolean,
  largest: number, total: number): number {
  return fraction * (ofLargest ? largest : total);
}

/** A depth allowance (a design rainfall) over the catch area.  Twin of
 *  bundMath::depthAllowance. */
export function depthAllowance(depth: number, catchArea: number): number {
  return depth * catchArea;
}

/** The governing term plus the allowances.  Twin of bundMath::requiredVolume. */
export function requiredVolume(governingTerm: number, allowances: number): number {
  return Math.max(0.0, governingTerm) + allowances;
}

// ---- The rule -------------------------------------------------------------------

export interface RuleTerm { fraction: number; of: "largest" | "total" }

/** A capacity rule as a Choupo layoutDict declares one: terms, the largest
 *  governs. */
export interface CapacityRule { id: string; label: string; terms: readonly RuleTerm[] }

/** The rules the exercise offers.  The first is the TEACHING EXAMPLE whose
 *  origin and limits step 8 traces (HSE HSG176 para 157; the Control of
 *  Pollution (Oil Storage) (England) Regulations 2001, regulation 3(2)(a));
 *  the second is the form the green-ammonia impounding witness declares;
 *  neither is presented as an obligation anywhere. */
export const RULES: readonly CapacityRule[] = [
  { id: "110-25", label: "110 % of the largest or 25 % of the total, the greater",
    terms: [{ fraction: 1.1, of: "largest" }, { fraction: 0.25, of: "total" }] },
  { id: "100", label: "100 % of the largest",
    terms: [{ fraction: 1.0, of: "largest" }] },
];

export interface RuleResult {
  largest: number; total: number;
  terms: { fraction: number; of: "largest" | "total"; volume: number }[];
  governing: "largest" | "total"; governingVolume: number;
}

/** The rule's terms on a set of volumes, the largest governing (the engine's
 *  loop in readBunds, on the twin's `termVolume`). */
export function applyRule(rule: CapacityRule, volumes: readonly number[]): RuleResult {
  const largest = volumes.reduce((m, v) => Math.max(m, v), 0);
  const total = volumes.reduce((s, v) => s + v, 0);
  let governingVolume = -1;
  let governing: "largest" | "total" = "largest";
  const terms = rule.terms.map((t) => {
    const volume = termVolume(t.fraction, t.of === "largest", largest, total);
    if (volume > governingVolume) { governingVolume = volume; governing = t.of; }
    return { ...t, volume };
  });
  return { largest, total, terms, governing, governingVolume: Math.max(0, governingVolume) };
}

// ---- The bund the page builds ------------------------------------------------------

/** A standing tank in the bund.  `capacity` is its nominal volume; its shell
 *  height follows from it and the diameter.  `plinth` is the height its
 *  bottom stands above the floor: on a SOLID plinth that volume is
 *  displaced, on legs it is free (the engine's own semantics: an item
 *  occupies its envelope from its declared base up). */
export interface Tank {
  id: string;
  capacity: number;     // m3
  D: number;            // m
  fill: number;         // fraction of the capacity it holds in normal operation
  plinth: number;       // m
  solidPlinth: boolean;
}

/** A rectangular bund, L along the section the page draws, W across it.  The
 *  floor falls by `slope` (m per m) towards the sump at x = 0; the wall top
 *  is level, and `wall` is its height above the floor's LOWEST point, at the
 *  sump.  `freeboard` is the height under the wall top the design keeps
 *  empty. */
export interface Bund {
  L: number; W: number; wall: number; slope: number; freeboard: number;
}

export const shellHeight = (t: Tank): number => t.capacity / (0.25 * Math.PI * t.D * t.D);
export const footprint = (t: Tank): number => 0.25 * Math.PI * t.D * t.D;
export const area = (b: Bund): number => b.L * b.W;
/** The fall of the floor across the bund [m]. */
export const fall = (b: Bund): number => b.slope * b.L;

/** The tanks' centres along L: evenly spaced, the gap at each wall equal to
 *  the gap between two tanks. */
export function tankPositions(b: Bund, tanks: readonly Tank[]): number[] {
  const gap = (b.L - tanks.reduce((s, t) => s + t.D, 0)) / (tanks.length + 1);
  const xs: number[] = [];
  let x = gap;
  for (const t of tanks) { xs.push(x + t.D / 2); x += t.D + gap; }
  return xs;
}

/** What makes the bund impossible to build as drawn -- the page's refusals,
 *  each in words.  Empty when it can be built. */
export function problems(b: Bund, tanks: readonly Tank[]): string[] {
  const out: string[] = [];
  if (!(b.L > 0 && b.W > 0)) out.push("the bund needs a positive length and width");
  if (!(b.wall > 0)) out.push("the wall needs a positive height");
  if (b.slope < 0) out.push("the floor falls towards the sump: a negative slope is not this page's geometry");
  if (fall(b) >= b.wall) out.push(`the floor falls ${fall(b).toFixed(2)} m across the bund, as much as the wall is high at the sump: the far end would have no wall at all`);
  if (b.freeboard < 0 || b.freeboard >= b.wall) out.push("the freeboard must be at least zero and less than the wall height");
  for (const t of tanks) {
    if (t.D > b.W) out.push(`tank ${t.id} (D = ${t.D} m) is wider than the bund (${b.W} m)`);
    if (!(t.capacity > 0 && t.D > 0)) out.push(`tank ${t.id} needs a positive capacity and diameter`);
  }
  if (tanks.reduce((s, t) => s + t.D, 0) > b.L) out.push("the tanks, side by side, are longer than the bund");
  return out;
}

/** The floor's elevation above the sump at x. */
export const floorAt = (b: Bund, x: number): number => b.slope * x;

/** The volume a liquid at elevation e (above the sump) holds over the EMPTY
 *  floor.  Flat: A e.  Sloped: a wedge until the far end is wet, then the
 *  prism over the whole floor less half the fall. */
export function floorVolume(b: Bund, e: number): number {
  if (e <= 0) return 0;
  if (b.slope === 0) return b.L * b.W * e;
  const d = fall(b);
  if (e <= d) return b.W * e * e / (2 * b.slope);
  return b.L * b.W * (e - d / 2);
}

/** The plan area a liquid at elevation e covers on the empty floor. */
export function floorWetArea(b: Bund, e: number): number {
  if (e <= 0) return 0;
  if (b.slope === 0) return b.L * b.W;
  return b.W * Math.min(b.L, e / b.slope);
}

/** A tank's body as the engine would declare it: a standing cylinder from
 *  the floor at its centre (z) up its height (H).  On legs the body starts
 *  at the plinth's top; on a solid plinth it starts at the floor and
 *  includes the plinth. */
export function tankBody(b: Bund, t: Tank, x: number): { z: number; H: number } {
  const zf = floorAt(b, x);
  return t.solidPlinth
    ? { z: zf, H: t.plinth + shellHeight(t) }
    : { z: zf + t.plinth, H: shellHeight(t) };
}

/** The volume tank t occupies below elevation e, its shell `intact` or not.
 *  A failed shell keeps its solid plinth (it is concrete). */
export function tankDisplaced(b: Bund, t: Tank, x: number, e: number, intact: boolean): number {
  const zf = floorAt(b, x);
  if (intact) {
    const body = tankBody(b, t, x);
    return displacedStanding(t.D, body.z, body.H, e);
  }
  return t.solidPlinth ? displacedStanding(t.D, zf, t.plinth, e) : 0;
}

/** The free volume of the bund below elevation e: the floor's, less what the
 *  tanks occupy.  `intact[i]` false leaves tank i's shell undeducted. */
export function freeVolume(b: Bund, tanks: readonly Tank[], intact: readonly boolean[],
  e: number): number {
  const xs = tankPositions(b, tanks);
  let v = floorVolume(b, e);
  tanks.forEach((t, i) => { v -= tankDisplaced(b, t, xs[i]!, e, intact[i] ?? true); });
  return v;
}

/** The plan area of the free surface at elevation e: what a pool spreads
 *  over, and what it evaporates from (by the derivative of freeVolume). */
export function poolArea(b: Bund, tanks: readonly Tank[], intact: readonly boolean[],
  e: number): number {
  const xs = tankPositions(b, tanks);
  let a = floorWetArea(b, e);
  tanks.forEach((t, i) => {
    const ok = intact[i] ?? true;
    const zf = floorAt(b, xs[i]!);
    const body = ok ? tankBody(b, t, xs[i]!)
      : { z: zf, H: t.solidPlinth ? t.plinth : 0 };
    if (e > body.z && e < body.z + body.H) a -= footprint(t);
  });
  return Math.max(0, a);
}

/** The elevation a volume V reaches in the bund (bisection: freeVolume is
 *  monotone), and what does not fit below the wall top.  `level` never
 *  exceeds the wall: what is above it has left over the wall. */
export function levelOf(b: Bund, tanks: readonly Tank[], intact: readonly boolean[],
  V: number): { level: number; overtop: number } {
  if (V <= 0) return { level: 0, overtop: 0 };
  const cap = freeVolume(b, tanks, intact, b.wall);
  if (V >= cap) return { level: b.wall, overtop: V - cap };
  let lo = 0, hi = b.wall;
  for (let k = 0; k < 200 && hi - lo > 1e-12; ++k) {
    const mid = 0.5 * (lo + hi);
    if (freeVolume(b, tanks, intact, mid) < V) lo = mid; else hi = mid;
  }
  return { level: 0.5 * (lo + hi), overtop: 0 };
}

// ---- The design check: two readings of one bund -----------------------------------

export type Basis = "capacity" | "held";

export interface DesignCheck {
  area: number;
  /** A x h_w, the flat-floor formula: the engine's gross volume. */
  gross: number;
  /** The empty box with its sloped floor, up to the wall top. */
  geometric: number;
  /** Every footprint below the wall top (the engine's rule; flat floor). */
  displacedAll: number;
  /** gross - displacedAll: the engine's net volume. */
  net: number;
  rule: RuleResult;
  rain: number;
  /** The engine's required volume: the governing term plus the rain. */
  required: number;
  engineAdequate: boolean;
  /** The tank whose failure the useful capacity is computed for. */
  failing: string;
  /** Up to the usable level (wall - freeboard), on the sloped floor, every
   *  OTHER tank deducted, less the rain already present. */
  useful: number;
  usefulAdequate: boolean;
  /** The useful capacity on a flat floor, no freeboard and no rain, minus
   *  the engine's net: the failing tank's footprint times the wall height
   *  (bounded by its body).  Never negative. */
  engineCredit: number;
}

/** The bund's design check, both ways.  The ENGINE reading is exactly what
 *  Choupo's layout check computes for this bund (a flat floor at grade,
 *  every enclosed footprint below the wall top, the rule plus the rain);
 *  the USEFUL reading is the page's fuller one. */
export function designCheck(b: Bund, tanks: readonly Tank[], rule: CapacityRule,
  basis: Basis, rainDepth: number): DesignCheck {
  const A = area(b);
  const xs = tankPositions(b, tanks);
  const flat: Bund = { ...b, slope: 0 };
  const gross = grossVolume(A, b.wall);
  let displacedAll = 0;
  tanks.forEach((t, i) => {
    const body = tankBody(flat, t, xs[i]!);
    displacedAll += displacedStanding(t.D, body.z, body.H, b.wall);
  });
  const net = gross - displacedAll;
  const volumes = tanks.map((t) => (basis === "capacity" ? t.capacity : t.capacity * t.fill));
  const rule_ = applyRule(rule, volumes);
  const rain = depthAllowance(rainDepth, A);
  const required = requiredVolume(rule_.governingVolume, rain);
  const iFail = volumes.indexOf(rule_.largest);
  const others = tanks.map((_, i) => i !== iFail);
  const usable = b.wall - b.freeboard;
  const useful = freeVolume(b, tanks, others, usable) - rain;
  const flatCredit = freeVolume(flat, tanks, others, b.wall) - net;
  return {
    area: A, gross, geometric: floorVolume(b, b.wall), displacedAll, net,
    rule: rule_, rain, required,
    engineAdequate: net + 1e-9 * Math.max(1, required) >= required,
    failing: tanks[iFail]?.id ?? "",
    useful, usefulAdequate: useful + 1e-9 * Math.max(1, rule_.governingVolume) >= rule_.governingVolume,
    engineCredit: flatCredit,
  };
}

/** The wall height at which the ENGINE's check is just met (bisection on a
 *  monotone net - required; the rain grows with nothing but the area).  Null
 *  when no wall up to `hMax` meets it. */
export function wallForEngineRule(b: Bund, tanks: readonly Tank[], rule: CapacityRule,
  basis: Basis, rainDepth: number, hMax = 20): number | null {
  const short = (h: number) => {
    const d = designCheck({ ...b, wall: h, freeboard: 0, slope: 0 }, tanks, rule, basis, rainDepth);
    return d.net - d.required;
  };
  if (short(hMax) < 0) return null;
  let lo = 0, hi = hMax;
  for (let k = 0; k < 200 && hi - lo > 1e-12; ++k) {
    const mid = 0.5 * (lo + hi);
    if (short(mid) < 0) lo = mid; else hi = mid;
  }
  return hi;
}

// ---- The four scenarios, in time -----------------------------------------------------

export type ScenarioKind = "rupture" | "leak";

export interface ScenarioInput {
  bund: Bund;
  tanks: readonly Tank[];
  /** Which tank fails. */
  tank: string;
  /** A: the shell fails at once; B: a hole at its base. */
  kind: ScenarioKind;
  /** B: the leak's flow at the start and at `leakEnd` [m3/h], linear between. */
  qStart: number;
  qEnd: number;
  leakEnd: number;       // h
  /** B: the leak is isolated at this time [h]; null never. */
  stopAt: number | null;
  /** C: rain already standing in the bund when the spill begins [m]. */
  rainDepth: number;
  /** D: the drain is open, through an opening of this diameter [m]. */
  drainOpen: boolean;
  drainDiameter: number;
  drainCd: number;
  /** The time integrated [h] and the step [s]. */
  duration: number;
  dt: number;
}

export interface ScenarioPoint {
  t: number;            // h
  level: number;        // m above the sump
  inTank: number;       // m3 still in the failing tank
  inBund: number;       // m3 standing in the bund (product and rain)
  overtopped: number;   // m3 that has left over the wall
  drained: number;      // m3 that has left through the drain
  tankLevel: number;    // m above the sump, the failing tank's inside
  shellIntact: boolean; // false once the inside and the bund are one pool
}

export interface ScenarioResult {
  points: ScenarioPoint[];
  initial: number;      // m3 the failing tank held
  rain: number;         // m3 of rain present at the start
  /** max over the run of |inTank + inBund + overtopped + drained - initial - rain| */
  imbalance: number;
}

/** The leak's flow at time t [m3/h], zero once isolated. */
export function leakFlow(s: ScenarioInput, tHours: number): number {
  if (s.stopAt !== null && tHours >= s.stopAt) return 0;
  const f = s.leakEnd > 0 ? Math.min(1, tHours / s.leakEnd) : 1;
  return Math.max(0, s.qStart + (s.qEnd - s.qStart) * f);
}

/** The drain's outflow through an orifice under the head e [m3/s]:
 *  Q = C_d (pi d^2 / 4) sqrt(2 g e). */
export function drainFlow(cd: number, d: number, head: number): number {
  return head > 0 ? cd * 0.25 * Math.PI * d * d * Math.sqrt(2 * G_N * head) : 0;
}

/** One scenario, integrated with a fixed step.  Every transfer is taken from
 *  one store and added to another in the same line, so the balance closes
 *  to rounding at every step -- `imbalance` measures that, it does not
 *  enforce it.
 *
 *  A rupture empties the shell at t = 0 and its footprint stops displacing.
 *  A leak moves liquid from inside the tank to the bund at the declared flow
 *  while the inside stands above the bund; when the two levels meet the
 *  hole joins them, the tank's contents are counted with the pool and its
 *  footprint stops displacing -- the levels are equal there, so the pool's
 *  level is continuous.  Rain is in the bund from t = 0.  An open drain
 *  empties the bund at the low point under the head of the pool.  What does
 *  not fit below the wall top leaves over it. */
export function simulate(s: ScenarioInput): ScenarioResult {
  const { bund: b, tanks } = s;
  const i = tanks.findIndex((t) => t.id === s.tank);
  if (i < 0) throw new Error(`no tank ${s.tank}`);
  const t0 = tanks[i]!;
  const x = tankPositions(b, tanks)[i]!;
  const a = footprint(t0);
  const shellBottom = floorAt(b, x) + t0.plinth;
  const intact = tanks.map(() => true);
  const initial = t0.capacity * t0.fill;
  const rain = depthAllowance(s.rainDepth, area(b));
  let inTank = initial, inBund = rain, over = 0, drained = 0;
  if (s.kind === "rupture") { inBund += inTank; inTank = 0; intact[i] = false; }
  const points: ScenarioPoint[] = [];
  let imbalance = 0;
  const settle = () => {
    const r = levelOf(b, tanks, intact, inBund);
    if (r.overtop > 0) { over += r.overtop; inBund -= r.overtop; }
    return r.level;
  };
  let level = settle();
  const record = (t: number) => {
    imbalance = Math.max(imbalance,
      Math.abs(inTank + inBund + over + drained - initial - rain));
    points.push({ t, level, inTank, inBund, overtopped: over, drained,
      tankLevel: intact[i] ? shellBottom + inTank / a : level, shellIntact: intact[i]! });
  };
  record(0);
  const n = Math.max(1, Math.ceil(s.duration * 3600 / s.dt));
  const every = Math.max(1, Math.floor(n / 400));
  for (let k = 1; k <= n; ++k) {
    const tH = (k - 1) * s.dt / 3600;
    if (intact[i] && s.kind === "leak") {
      const inside = shellBottom + inTank / a;
      if (inside <= level || inTank <= 0) {
        inBund += inTank; inTank = 0; intact[i] = false;
      } else {
        const q = Math.min(leakFlow(s, tH) / 3600 * s.dt, inTank);
        inTank -= q; inBund += q;
      }
    }
    if (s.drainOpen) {
      const q = Math.min(drainFlow(s.drainCd, s.drainDiameter, level) * s.dt, inBund);
      inBund -= q; drained += q;
    }
    level = settle();
    if (k % every === 0 || k === n) record(k * s.dt / 3600);
  }
  return { points, initial, rain, imbalance };
}

/** The scenario's default inputs on a bund: the given tank, full, ruptured,
 *  no rain, the drain closed, an hour at a one-second step. */
export function scenarioDefaults(b: Bund, tanks: readonly Tank[], tank: string): ScenarioInput {
  return {
    bund: b, tanks, tank, kind: "rupture", qStart: 30, qEnd: 30, leakEnd: 1,
    stopAt: null, rainDepth: 0, drainOpen: false, drainDiameter: 0.1, drainCd: DRAIN_CD,
    duration: 1, dt: 1,
  };
}

// ---- Geometry decides: one volume, three walls -------------------------------------

/** The hydrostatic thrust on a metre of wall holding liquid of density rho to
 *  height h, and its overturning moment about the wall's foot:
 *  F = rho g h^2 / 2 [N/m], M = rho g h^3 / 6 [N m/m]. */
export function wallLoad(rho: number, h: number): { F: number; M: number } {
  return { F: 0.5 * rho * G_N * h * h, M: rho * G_N * h * h * h / 6 };
}

/** For a volume V to hold with wall height h on a square bund round the
 *  tanks' footprints Af (which they occupy to above h): the floor area
 *  needed, its side, and the pool's free surface. */
export function bundForWall(V: number, h: number, Af: number): { area: number; side: number; pool: number } {
  const A = V / h + Af;
  return { area: A, side: Math.sqrt(A), pool: A - Af };
}

// ---- The exercise ------------------------------------------------------------------

/** Vitor's exercise: three tanks of 20, 15 and 10 m3.  The diameters are the
 *  page's choice (the shells then stand taller than any sensible wall, so
 *  each displaces up to the wall top), the tanks full, standing on the
 *  floor. */
export const EXERCISE_TANKS: readonly Tank[] = [
  { id: "T1", capacity: 20, D: 2.6, fill: 1, plinth: 0, solidPlinth: true },
  { id: "T2", capacity: 15, D: 2.4, fill: 1, plinth: 0, solidPlinth: true },
  { id: "T3", capacity: 10, D: 2.0, fill: 1, plinth: 0, solidPlinth: true },
];

/** The exercise's starting bund: 11 m x 5 m, a 0.55 m wall, a flat floor. */
export const EXERCISE_BUND: Bund = { L: 11, W: 5, wall: 0.55, slope: 0, freeboard: 0 };

/** HSE HSG176 (2015) para 161's recommended minimum separation between a
 *  tank and its bund wall [m]: 1 m for tanks up to 100 m3, 2 m above. */
export function hsg176WallClearance(capacity: number): number {
  return capacity <= 100 ? 1 : 2;
}

/** Each tank's clearance to the nearest wall in the drawn arrangement: the
 *  gap along L at the end tanks, across W for all. */
export function wallClearances(b: Bund, tanks: readonly Tank[]): { id: string; clearance: number; recommended: number }[] {
  const xs = tankPositions(b, tanks);
  return tanks.map((t, i) => {
    const along = Math.min(xs[i]! - t.D / 2, b.L - xs[i]! - t.D / 2);
    const across = (b.W - t.D) / 2;
    return { id: t.id, clearance: Math.min(along, across), recommended: hsg176WallClearance(t.capacity) };
  });
}

/** The closing reflection, Vitor's words, verbatim (DEV.md 4c C136 item 11). */
export const CLOSING_REFLECTION = "A process flowsheet shows how a chemical plant is "
  + "intended to operate. Secondary containment shows how engineers prepare for "
  + "the possibility that it will not.";
