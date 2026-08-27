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
  thielePellet (the case side) — the readings, the knob map and the view
  geometry behind the EduTools "Catalyst pellet (Thiele modulus)" tool.

  It imports NOTHING from the plotting kit and nothing from React, so the node
  test runner reaches every function in it with no mock at all — the same
  posture as case/hunterNash.ts.

  WHAT THE ENGINE PUBLISHES, and it is the whole basis of the drawing.  One
  `thielePellet` operation (src/propertyOps/ThielePellet.cpp) writes three CSVs
  and a flat diagnostics block:

      pelletConcentrationField.csv
          geometry, phi, phi_char, xi, c_over_cs, c_over_cs_closedForm,
          absDeviation                      — ONE geometry, ONE modulus, one
                                              row per grid point, xi measured
                                              from the pellet CENTRE
      pelletEtaPhi.csv
          geometry, phi, phi_char, eta, eta_closedForm, relDeviation, eta_flux
                                            — the PARAMETRIC eta(phi) family
                                              over all three geometries
      pelletGridRefinement.csv
          geometry, phi, nodes, h, eta, eta_closedForm, relDeviation

  plus diagnostics carrying phi, phi_char, eta, eta_closedForm, eta_flux,
  c_centre, field_maxAbsDeviation, D_eff, Lambda, dimension, weiszPrater and
  the gate flags.

  ZERO PHYSICS IN TYPESCRIPT, and here that is unusually easy to honour: the
  engine publishes the numerical answer AND its closed form in the SAME ROW, so
  the view draws both and computes neither.  Nothing in this file evaluates a
  modulus, an effectiveness factor, a profile or a deviation, and nothing
  interpolates BETWEEN published rows — the bands and rings the cross-sections
  are built from are piecewise constant over intervals whose ends are two
  published `xi`, filled with one published `c_over_cs`.

  WHY THREE RUNS.  The field CSV carries one geometry, because a case declares
  one pellet.  The lesson the owner asked for — a slab, a cylinder and a sphere
  at the same modulus have DIFFERENT profiles — therefore needs three runs of
  the same witness with the catalyst record's `geometry` word swapped.  The
  three are otherwise byte-identical, so what differs on screen is the shape
  and nothing else.

  THE SLAB NEEDS A KEY RENAME, not a second record.  The engine refuses a
  catalyst whose characteristic dimension is named by the wrong key: `radius`
  for a sphere or a cylinder, `halfThickness` for a slab, and declaring the
  other one refuses rather than being reinterpreted.  So the slab override
  renames the key in place and carries the record's own authored number and
  unit across (case/methodRun.ts `KeyRename`).  The consequence is stated on
  screen rather than left implicit: the three shapes are compared at the SAME
  characteristic dimension, which is a choice of comparison and not a fact.
\*---------------------------------------------------------------------------*/

import type { OperationResult } from "../adapters/SolverAdapter.js";
import type { DictOverride } from "./methodRun.js";

// ---- The witness ------------------------------------------------------------

/** The bundled tutorial the tool runs, three times, in the browser. */
//  THE WITNESS CARRIES THE THERMAL BLOCK (2026-08-27).  thiele01 stays as the
//  ISOTHERMAL control -- its golden is untouched and it is what the engine's
//  own verification runs against -- and the tool runs thiele02, which declares
//  `thermal { heatOfReaction; thermalConductivity; surfaceConcentration; }` and
//  therefore publishes a temperature field beside the concentration one.  The
//  extra columns are OPTIONAL everywhere below, so pointing this back at an
//  isothermal case degrades to exactly the old behaviour.
export const THIELE_WITNESS = "props/reactor/thiele02_prater_temperature";

/** The two dict files the knobs write into (case-root-relative, exactly the
 *  keys `tutorials.ts` bundles them under). */
export const PROPS_DICT = "system/propsDict";
export const CATALYST_DAT = "constant/assets/aluminaSphere3mm.dat";

/** The three CSVs the operation declares in its `output {}` block. */
export const FIELD_CSV = "pelletConcentrationField.csv";
export const SWEEP_CSV = "pelletEtaPhi.csv";
export const REFINEMENT_CSV = "pelletGridRefinement.csv";

/** What the witness is, in words the panel prints: the diffusing reactant, its
 *  counter-diffusing partner and the catalyst record. */
export const WITNESS_SPECIES = "CO";
export const WITNESS_CARRIER = "N2";
export const WITNESS_CATALYST = "aluminaSphere3mm";
//  The witness's operation NAME ("thiele_CO_alumina") is deliberately not a
//  constant here: nothing selects on it.  `readPelletDiagnostics` picks the
//  operation by its declared TYPE, because a case author's chosen name is
//  theirs to change and the type is the engine's contract.

// ---- Geometry ---------------------------------------------------------------

export type PelletGeometry = "slab" | "cylinder" | "sphere";

/** Drawn and run in this order, always: it is the order of increasing shape
 *  factor, so the three cross-sections read left to right the way the theory
 *  guide's shape factor s = 0, 1, 2 does. */
export const GEOMETRIES: readonly PelletGeometry[] =
  ["slab", "cylinder", "sphere"];

/** The key the catalyst record must name its characteristic dimension by, for
 *  a given geometry.  This is the ENGINE's rule, not a preference: the record
 *  refuses the other spelling instead of reinterpreting it. */
export function dimensionKey(g: PelletGeometry): "radius" | "halfThickness" {
  return g === "slab" ? "halfThickness" : "radius";
}

/** The witness's own authored geometry — the one whose key needs no rename. */
export const WITNESS_GEOMETRY: PelletGeometry = "sphere";

// ---- The knobs --------------------------------------------------------------
//
// Every knob writes ONE declared scalar of the witness's own dicts, and the
// engine recomputes everything from it.  Nothing below is a value this file
// knows the meaning of: `rateConstant` moves the modulus because the ENGINE
// forms phi from k, D_eff and the pellet dimension, and the tool never forms
// one.

export interface ThieleKnob {
  id: string;
  label: string;
  /** The dict file the key lives in; `null` = the catalyst record's
   *  characteristic dimension, whose KEY depends on the geometry being run. */
  file: string | null;
  /** The dict key as written.  Absent for the dimension knob (see `file`). */
  key?: string;
  def: number;
  min: number;
  max: number;
  step: number;
  /** The unit word the dict declares ("" when the dict declares it bare).  The
   *  override writes the number only; the unit survives untouched. */
  unit: string;
  /** When the key legitimately appears more than once in its file. */
  occurrence?: number;
  /** One line the student reads: what turning this changes. */
  why: string;
}

export const THIELE_KNOBS: readonly ThieleKnob[] = [
  {
    //  `unit` is EMPTY because the witness declares the rate constant BARE
    //  (`rateConstant 40.0;`, with "1/s" in the comment beside it), and this
    //  field means "the unit word the dict declares" — the override writes the
    //  number only and must not grow one.  The unit is in the label instead.
    id: "rateConstant", label: "rate constant k [1/s, per pellet volume]",
    file: PROPS_DICT, key: "rateConstant",
    def: 40, min: 0.4, max: 4000, step: 0.1, unit: "",
    //  THE HINTS ARE SHORT ON PURPOSE, and the reason is measured rather than
    //  stylistic: `why` renders as visible text in the panel (hover is not a
    //  thing a finger has), and the first version's five paragraphs made the
    //  panel taller than the 1400x900 viewport — bin/checkGui listed the sixth
    //  knob's stepper and slider as clipped behind the panel's own edge.  Each
    //  hint now carries the one thing a reader must know AT THE KNOB; the rest
    //  is in the limits block under the drawing, which is on screen anyway.
    why: "The knob that walks the field from nearly flat to a boundary layer "
      + "on the surface. Above ~400 1/s the default grid misses the case's own "
      + "1e-4 tolerance and the run exits 1 — raise the grid points below.",
  },
  {
    id: "dimension", label: "characteristic dimension (radius, or the slab's half-thickness)",
    file: null,
    def: 1.5, min: 0.2, max: 8, step: 0.1, unit: "mm",
    why: "One length for all three shapes — that is what makes them "
      + "comparable at one modulus.",
  },
  {
    id: "tau", label: "tortuosity tau of the pore network",
    file: CATALYST_DAT, key: "tau",
    def: 3, min: 1, max: 7, step: 0.25, unit: "",
    why: "The record's own most doubtful number, and it says so: reported "
      + "anywhere between 2 and 7, which alone moves eta about threefold.",
  },
  {
    id: "T", label: "pellet temperature T",
    file: PROPS_DICT, key: "T",
    def: 573.15, min: 373.15, max: 873.15, step: 25, unit: "K",
    why: "Moves D_eff (Fuller), hence the modulus. It does NOT move k — this "
      + "operation has no Arrhenius term, so heating here only helps "
      + "diffusion, which a real catalyst would not do.",
  },
  {
    id: "nodes", label: "grid points across the pellet",
    file: PROPS_DICT, key: "nodes", occurrence: 1,
    def: 401, min: 101, max: 801, step: 100, unit: "",
    why: "Odd by construction (Simpson's rule needs an even interval count), "
      + "so it steps in hundreds from 101. Nothing physical moves — only how "
      + "well the boundary layer is resolved.",
  },
];

/** A half-decade ladder over the rate constant, so one drag walks the field
 *  across four decades of k.  Every entry is written into the dict VERBATIM —
 *  the ladder is a list of literals the reader can also type, not a scale the
 *  view computes on. */
export const RATE_CONSTANT_LADDER: readonly number[] =
  [0.4, 1.3, 4, 13, 40, 130, 400, 1300, 4000];

/** Which rung a given k is nearest to, in log space (a UI question about a
 *  slider handle, never a physical one). */
export function nearestLadderIndex(k: number): number {
  if (!Number.isFinite(k) || k <= 0) return 0;
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < RATE_CONSTANT_LADDER.length; ++i) {
    const gap = Math.abs(Math.log(k) - Math.log(RATE_CONSTANT_LADDER[i]!));
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  return best;
}

export type ThieleKnobValues = { [id: string]: number };

export function defaultKnobValues(): ThieleKnobValues {
  const out: ThieleKnobValues = {};
  for (const k of THIELE_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values -> the overrides ONE geometry's run receives.
 *
 *  ORDER MATTERS and is the caller's responsibility, which is why it is fixed
 *  here: for a slab the key rename comes FIRST and the dimension scalar is
 *  written against the renamed key.  The reverse order would write the number
 *  and then rename a key the writer had already moved past — which happens to
 *  work, and would stop working the day the rename learned to reformat.
 *
 *  Non-finite knob values are dropped (that knob keeps the witness's own
 *  authored number), never written as NaN. */
export function overridesFor(
  values: ThieleKnobValues, geometry: PelletGeometry,
): DictOverride[] {
  const out: DictOverride[] = [];

  // 1. The shape word.  Written for EVERY geometry including the witness's own
  //    sphere: an override that is a no-op still proves the key was found, and
  //    a silent no-op is what this module's uniqueness rule exists to prevent.
  out.push({ file: CATALYST_DAT, key: "geometry", word: geometry });

  // 2. The characteristic dimension's KEY, when the shape renames it.
  const key = dimensionKey(geometry);
  if (key !== dimensionKey(WITNESS_GEOMETRY))
    out.push({ file: CATALYST_DAT, from: dimensionKey(WITNESS_GEOMETRY), to: key });

  // 3. The scalars.
  for (const k of THIELE_KNOBS) {
    const v = values[k.id];
    if (v === undefined || !Number.isFinite(v)) continue;
    if (k.file === null) out.push({ file: CATALYST_DAT, key, value: v });
    else out.push({ file: k.file, key: k.key!, value: v, occurrence: k.occurrence });
  }
  return out;
}

// ---- Reading the field CSV --------------------------------------------------

export interface FieldRow {
  xi: number;
  /** c/c_s, solved numerically on the declared grid. */
  u: number;
  /** c/c_s from the first-order isothermal closed form, at the same xi. */
  uClosed: number;
  /** |u - uClosed|, as published — never recomputed here. */
  absDev: number;
  /** T/T_s, published ONLY when the case declared a `thermal {}` block.
   *  `undefined` means the run published no temperature — which is a
   *  different statement from a pellet that is isothermal, and the two must
   *  not be allowed to look alike. */
  tOverTs?: number;
  /** The same point in kelvin, as published. */
  tK?: number;
}

export interface FieldRead {
  geometry: string;
  /** The generalised modulus (on Lambda = V/S), as published. */
  phi: number;
  /** The modulus on the characteristic dimension, as published. */
  phiChar: number;
  rows: FieldRow[];
  /** Rows the reader could not use.  Surfaced: a silently dropped row is a
   *  hole in the picture. */
  skippedRows: number;
  /** Whether `xi` arrived non-decreasing.  The drawing walks the rows in file
   *  order, so a file that is not sorted would be drawn folded — said rather
   *  than quietly sorted, because re-sorting would hide a writer change. */
  xiMonotonic: boolean;
}

export type Read<T> = { ok: true; read: T } | { ok: false; why: string };

const FIELD_HEADER = "geometry,phi,phi_char,xi,c_over_cs,"
  + "c_over_cs_closedForm,absDeviation";

/** The same field WITH the temperature columns the `thermal {}` block adds. */
const FIELD_HEADER_T = FIELD_HEADER + ",T_over_Ts,T_K";

const SWEEP_HEADER = "geometry,phi,phi_char,eta,eta_closedForm,"
  + "relDeviation,eta_flux";

function headerRefusal(
  got: readonly string[], want: string, what: string,
): string {
  return `this CSV is not ${what} (its header is '${got.join(",")}'; `
    + `the tool needs '${want}', which the thielePellet operation writes)`;
}

/** Parse the intraparticle concentration field.
 *
 *  Refuses on a header that is not the field CSV's, and refuses a file
 *  carrying MORE THAN ONE geometry: the field CSV is one pellet's field, and a
 *  reader that quietly took the first geometry would draw one shape under
 *  another shape's caption. */
export function readPelletField(csv: string): Read<FieldRead> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: false, why: "the field CSV is empty" };
  const header = lines[0]!.split(",").map((s) => s.trim());
  //  EXACTLY TWO forms are accepted, and nothing else.  A run that declared
  //  no `thermal {}` block writes the base header; one that did appends
  //  `T_over_Ts,T_K`.  Kept as an equality against a closed list rather than
  //  a prefix test, so a header that has DRIFTED still refuses by name
  //  instead of being read positionally and silently mis-columned.
  const joined = header.join(",");
  const hasT = joined === FIELD_HEADER_T;
  if (joined !== FIELD_HEADER && !hasT)
    return { ok: false, why: headerRefusal(header, FIELD_HEADER,
      "a thielePellet CONCENTRATION FIELD") };

  const rows: FieldRow[] = [];
  const geometries = new Set<string>();
  let skippedRows = 0;
  let phi = NaN;
  let phiChar = NaN;
  let xiMonotonic = true;
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== header.length) { ++skippedRows; continue; }
    const xi = Number(c[3]), u = Number(c[4]);
    const uClosed = Number(c[5]), absDev = Number(c[6]);
    const p = Number(c[1]), pc = Number(c[2]);
    if (![xi, u, uClosed, absDev, p, pc].every(Number.isFinite)) {
      ++skippedRows; continue;
    }
    geometries.add((c[0] ?? "").trim());
    phi = p; phiChar = pc;
    const last = rows[rows.length - 1];
    if (last && xi < last.xi) xiMonotonic = false;
    //  OPTIONAL by construction: an isothermal run has no such columns and
    //  the row carries `undefined` rather than a number that would read as a
    //  temperature.  A row whose temperature cells are unreadable in a file
    //  that HAS them is skipped with the rest, not silently de-thermalised.
    let tOverTs: number | undefined;
    let tK: number | undefined;
    if (hasT) {
      const a = Number(c[7]), b = Number(c[8]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) { ++skippedRows; continue; }
      tOverTs = a; tK = b;
    }
    rows.push(hasT ? { xi, u, uClosed, absDev, tOverTs: tOverTs!, tK: tK! }
                   : { xi, u, uClosed, absDev });
  }
  if (rows.length < 2)
    return { ok: false, why: "the field CSV carries fewer than two usable "
      + `rows (${skippedRows} row(s) were unreadable)` };
  if (geometries.size !== 1)
    return { ok: false, why: "the field CSV carries "
      + `${geometries.size} geometries (${[...geometries].join(", ")}); a `
      + "concentration field belongs to ONE pellet, and drawing the first of "
      + "several under one caption would be a category error" };

  return {
    ok: true,
    read: {
      geometry: [...geometries][0]!, phi, phiChar, rows, skippedRows,
      xiMonotonic,
    },
  };
}

// ---- Reading the eta(phi) family --------------------------------------------

export interface SweepPoint {
  phi: number;
  phiChar: number;
  eta: number;
  etaClosed: number;
  relDev: number;
  /** eta from the surface flux — a second, independent functional of the same
   *  field, published so its agreement with the volume integral can be seen. */
  etaFlux: number;
}

export interface SweepSeries {
  geometry: string;
  points: SweepPoint[];
}

export interface SweepRead {
  series: SweepSeries[];
  skippedRows: number;
}

/** Parse the parametric eta(phi) family, grouped by geometry in first-seen
 *  order and otherwise in file order — the engine writes each geometry's
 *  points log-spaced and ascending, and re-sorting here would hide it if it
 *  ever stopped. */
export function readEtaPhiSweep(csv: string): Read<SweepRead> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: false, why: "the sweep CSV is empty" };
  const header = lines[0]!.split(",").map((s) => s.trim());
  if (header.join(",") !== SWEEP_HEADER)
    return { ok: false, why: headerRefusal(header, SWEEP_HEADER,
      "a thielePellet eta(phi) FAMILY") };

  const byGeometry = new Map<string, SweepPoint[]>();
  let skippedRows = 0;
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== header.length) { ++skippedRows; continue; }
    const phi = Number(c[1]), phiChar = Number(c[2]), eta = Number(c[3]);
    const etaClosed = Number(c[4]), relDev = Number(c[5]), etaFlux = Number(c[6]);
    if (![phi, phiChar, eta, etaClosed, relDev, etaFlux].every(Number.isFinite)
      || !(phi > 0)) {
      ++skippedRows; continue;
    }
    const g = (c[0] ?? "").trim();
    const bucket = byGeometry.get(g);
    const pt: SweepPoint = { phi, phiChar, eta, etaClosed, relDev, etaFlux };
    if (bucket) bucket.push(pt); else byGeometry.set(g, [pt]);
  }
  const series = [...byGeometry.entries()]
    .map(([geometry, points]) => ({ geometry, points }))
    .filter((s) => s.points.length >= 2);
  if (series.length === 0)
    return { ok: false, why: "the sweep CSV carries no geometry with two "
      + `usable points (${skippedRows} row(s) were unreadable)` };
  return { ok: true, read: { series, skippedRows } };
}

// ---- Reading the operation's own diagnostics --------------------------------

/** The numbers the operation publishes about the case's OWN pellet — the ones
 *  the CSVs do not carry.  `eta` in particular is nowhere in the field CSV: it
 *  is the volume integral of that field, and the engine is the only thing here
 *  allowed to have taken it.
 *
 *  Every field is optional and none is defaulted: an absent diagnostic is
 *  rendered as "—", never as a zero that would read like a measurement. */
export interface PelletDiagnostics {
  phi?: number;
  phiChar?: number;
  eta?: number;
  etaClosed?: number;
  etaRelDeviation?: number;
  etaFlux?: number;
  cCentre?: number;
  cCentreClosed?: number;
  fieldMaxAbsDeviation?: number;
  weiszPrater?: number;
  dEff?: number;
  lambda?: number;
  dimension?: number;
  nodes?: number;
  /** The operation's own verdict on its own answer (`gates_pass`).  Absent
   *  when the block did not carry it.
   *
   *  IN A BROWSER RUN IT IS ONLY EVER `true` TODAY, and that is a property of
   *  the worker rather than of this reader: a failed verification exits 1, and
   *  gui/public/workers/solverWorker.js harvests nothing at all on a non-zero
   *  exit code, so a `false` never travels.  The reading is kept honest here
   *  (and tested both ways) rather than narrowed to what one caller can
   *  currently see; the tool states the same thing where it would have drawn
   *  it. */
  gatesPass?: boolean;
}

const num = (d: { [k: string]: number }, k: string): number | undefined =>
  Number.isFinite(d[k]) ? d[k] : undefined;

/** Pull the `thielePellet` entry out of a props run's operationResults.
 *  Selected by the operation's declared TYPE, never by its name: the name is
 *  the case author's and could be anything. */
export function readPelletDiagnostics(
  ops: readonly OperationResult[] | undefined,
): PelletDiagnostics | null {
  const op = ops?.find((o) => o.type === "thielePellet");
  if (!op) return null;
  const d = op.diagnostics ?? {};
  const gate = num(d, "gates_pass");
  return {
    phi: num(d, "phi"),
    phiChar: num(d, "phi_char"),
    eta: num(d, "eta"),
    etaClosed: num(d, "eta_closedForm"),
    etaRelDeviation: num(d, "eta_relDeviation"),
    etaFlux: num(d, "eta_flux"),
    cCentre: num(d, "c_centre"),
    cCentreClosed: num(d, "c_centre_closedForm"),
    fieldMaxAbsDeviation: num(d, "field_maxAbsDeviation"),
    weiszPrater: num(d, "weiszPrater"),
    dEff: num(d, "D_eff"),
    lambda: num(d, "Lambda"),
    dimension: num(d, "dimension"),
    nodes: num(d, "nodes"),
    gatesPass: gate === undefined ? undefined : gate === 1,
  };
}

// ---- View geometry: the cross-sections --------------------------------------

/** One drawn band or ring: the interval [from, to] in xi, filled with ONE
 *  published c/c_s.  Piecewise constant over published values; nothing is
 *  interpolated and no xi is invented. */
export interface FieldBand {
  from: number;
  to: number;
  u: number;
  /** Carried from the band's inner row; undefined on an isothermal run. */
  tOverTs?: number;
  tK?: number;
}

/** Reduce a published field to at most `maxBands` piecewise-constant bands.
 *
 *  A 401-point field would be 400 rectangles or rings, most of them narrower
 *  than a screen pixel.  The reduction is a STRIDE over the published rows —
 *  every band's colour is one published `c_over_cs`, and both its ends are
 *  published `xi`.  Dropping rows is not the same as averaging them, and only
 *  the first is done here. */
export function fieldBands(
  rows: readonly FieldRow[], maxBands: number,
): FieldBand[] {
  const n = rows.length;
  if (n < 2 || maxBands < 1) return [];
  const stride = Math.max(1, Math.ceil((n - 1) / maxBands));
  const out: FieldBand[] = [];
  for (let i = 0; i < n - 1; i += stride) {
    const j = Math.min(i + stride, n - 1);
    const r = rows[i]!;
    out.push({ from: r.xi, to: rows[j]!.xi, u: r.u, tOverTs: r.tOverTs,
               tK: r.tK });
  }
  return out;
}

/** The temperature range over a field, for the ramp to be normalised against.
 *  Returns null when the run published no temperature at all — never a
 *  degenerate [0,0], which would paint a field that does not exist. */
export function fieldTemperatureRange(
  rows: readonly FieldRow[],
): { lo: number; hi: number } | null {
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) {
    if (r.tK === undefined || !Number.isFinite(r.tK)) continue;
    if (r.tK < lo) lo = r.tK;
    if (r.tK > hi) hi = r.tK;
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi } : null;
}

// ---- View geometry: the colour ramp -----------------------------------------

/** Three stops of the c/c_s ramp: depleted core -> surface value.  Chosen to
 *  read on both the light and the dark background (the ramp is a fill, and the
 *  outline and labels carry the theme's own ink over it). */
const RAMP: readonly [number, number, number][] = [
  [26, 35, 62],     // c/c_s = 0   — a dead core
  [38, 143, 166],   // c/c_s = 0.5
  [255, 226, 130],  // c/c_s = 1   — the external surface
];

const mix = (a: number, b: number, t: number): number =>
  Math.round(a + (b - a) * t);

/** The fill for a published c/c_s.  Clamped rather than refused: a converged
 *  field can overshoot 1 by round-off at the surface node, and a black hole in
 *  the drawing would be a worse report of that than a clamped pixel. */
/** The TEMPERATURE ramp, deliberately a different family from the
 *  concentration one so the two pictures can never be confused at a glance:
 *  cool surface -> hot core.  `t` is already normalised to [0,1] over the
 *  field's own range by the caller, because an absolute kelvin ramp would
 *  paint every pellet the same colour. */
const T_RAMP: readonly [number, number, number][] = [
  [ 40,  70, 120],   // coolest point in this field — the surface
  [214, 118,  56],
  [255, 234, 168],   // hottest point — the centre, for an exothermic pellet
];

export function temperatureColor(t: number): string {
  const x = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const lo = x < 0.5 ? T_RAMP[0]! : T_RAMP[1]!;
  const hi = x < 0.5 ? T_RAMP[1]! : T_RAMP[2]!;
  const k = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  return `rgb(${mix(lo[0], hi[0], k)},${mix(lo[1], hi[1], k)},`
    + `${mix(lo[2], hi[2], k)})`;
}

export function fieldColor(u: number): string {
  const x = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  const lo = x < 0.5 ? RAMP[0]! : RAMP[1]!;
  const hi = x < 0.5 ? RAMP[1]! : RAMP[2]!;
  const t = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  return `rgb(${mix(lo[0], hi[0], t)},${mix(lo[1], hi[1], t)},`
    + `${mix(lo[2], hi[2], t)})`;
}

// ---- What the view must say about itself ------------------------------------
//
// Not "omitted for clarity", and not a tooltip: hover is not a thing a finger
// has, and a limit a reader can only discover by hovering is a limit that was
// not stated.  Each entry is rendered on screen, in this order.

export interface ToolLimit {
  id: string;
  title: string;
  body: string;
}

export const THIELE_LIMITS: readonly ToolLimit[] = [
  {
    id: "isothermal",
    title: "Isothermal, and first order. Nothing else is modelled.",
    body: "The pellet is held at one temperature and the reaction is first "
      + "order in the diffusing species. The NON-isothermal pellet is not "
      + "modelled at all: coupled to an Arrhenius rate it has up to three "
      + "steady states for one modulus and eta may exceed 1, so its answer is "
      + "a SET and no single curve on this screen could stand for it. Orders "
      + "other than first are not modelled either — they have no closed form, "
      + "so there would be no oracle to check the numerical field against, "
      + "which is the whole point of drawing both.",
  },
  {
    id: "film",
    title: "The external film is neglected: c_s is taken as the bulk concentration.",
    body: "Every profile here starts at c/c_s = 1 at the surface by "
      + "construction. If the film outside the pellet offers real resistance, "
      + "a second resistance sits in series with everything drawn and the "
      + "surface value is not the bulk one.",
  },
  {
    id: "surrogate",
    title: "The catalyst behind this witness is a TEACHING SURROGATE. No number here is a claim about a real catalyst.",
    body: "The record (constant/assets/aluminaSphere3mm.dat) declares "
      + "`provenance.identity.origin teachingSurrogate;` and the engine "
      + "announces it on every run. Its porosity and tortuosity could not be "
      + "sourced to a primary measurement and the record says so rather than "
      + "carrying a citation that would not support them. Tortuosity alone is "
      + "conventionally reported between 2 and 7, and that spread moves eta by "
      + "about a factor of three — the tau knob is there so you can see it. "
      + "What IS verified here is different and does not depend on any of "
      + "those numbers: that the numerical field reproduces the closed form at "
      + "whatever modulus they produce.",
  },
  {
    id: "no-reactor",
    title: "NO REACTOR APPLIES eta YET. This computes it; nothing multiplies by it.",
    body: "Choupo's four reactors (cstr, pfr, batchReactor, dynamicCSTR) read "
      + "`catalystLoading` as a unit conversion and then evaluate the rate at "
      + "BULK conditions — which is eta = 1, announced on every run that "
      + "declares a loading. So do not leave this screen thinking your packed "
      + "bed has been corrected: an eta of 0.19 means a bed sized on the "
      + "intrinsic rate is undersized about fivefold, and nothing in the "
      + "engine has applied that yet.",
  },
  {
    id: "same-dimension",
    title: "The three shapes are compared at the SAME characteristic dimension. That is a choice, not a fact.",
    body: "The slab's half-thickness is set equal to the cylinder's and the "
      + "sphere's radius, so all three share one modulus on that length and "
      + "differ only in shape factor. Compare them instead on the generalised "
      + "modulus (Lambda = V/S, which the engine publishes beside it) and they "
      + "nearly collapse onto one curve — that is what the eta(phi) family "
      + "view shows.",
  },
];
