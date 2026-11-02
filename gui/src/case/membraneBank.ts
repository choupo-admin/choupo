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
  membraneBank -- a bank of pressure vessels, READ from the `membraneBank`
  specification sheet and nothing else (DEV.md 4c C199 phase B).

  THE RULE.  Every number here is a key of the sheet (`MembraneBankSize.cpp`
  writes them, `check_design_sheet` holds this reader's fixture to them): the
  vessel's outside diameter and length, the vessels per tier, the tiers, the
  racks, the pitch, the tier pitch, the base height, the end margin, the aisle,
  the loading clearance.  NOTHING is typed here.  A key the sheet does not
  carry is NAMED in `missing` and the caller draws a labelled box rather than a
  guess.

  THE FRAME OF A BANK (the engine's, MembraneBankSize.cpp):
    x  along the vessels; the rack starts at 0, the loading clearance is free
       at the high-x end, so the bank is `envelopeLength = rackLength +
       loadingClearance` long;
    y  across: the racks stand side by side with `rackAisle` between them, so
       the bank is `envelopeWidth = racks rackWidth + (racks-1) aisle` wide;
    z  up from the floor: a rack is `baseHeight + tiers tierPitch` tall.
  The vessel's axis is along x, its centre `endMargin + vesselLength/2` from the
  rack's start; each tier is a row of `vesselsPerTier` vessels at `pitch`, the
  tiers `tierPitch` apart above `baseHeight`.

  THREE CONVENTIONS THE SHEET DOES NOT STATE, named so they can be questioned
  (drafting, never a number the engine computed): a vessel sits at the CENTRE
  of its pitch cell; a rack is filled BOTTOM TIER FIRST, tier by tier (the last
  rack holds `vesselsLastRack`, which the sheet states); the loading clearance
  is the free strip at the high-x end of EVERY rack (the engine publishes one
  per bank).
\*---------------------------------------------------------------------------*/

import type { DesignSheet } from "./designSheet.js";

/** A sizing value of the sheet by key (local, so the 3D model and the layout
 *  export do not pull the whole schematic module in for one lookup). */
const sizingValue = (sheet: DesignSheet | null | undefined, key: string) =>
  sheet?.sizing.find((v) => v.key === key);

/** The sheet keys the bank is drawn from, all in metres except the counts. */
export const BANK_COUNT_KEYS = ["vessels", "elementsPerVessel", "vesselsPerRack", "tiers",
  "vesselsPerTier", "racks", "vesselsLastRack"] as const;
export const BANK_LENGTH_KEYS = ["elementLength", "vesselEndAllowance", "vesselLength", "vesselOutsideDiameter",
  "pitch", "tierPitch", "baseHeight", "endMargin", "rackAisle", "rackLength", "rackWidth",
  "rackHeight", "loadingClearance", "envelopeLength", "envelopeWidth",
  "envelopeHeight"] as const;

/** A bank of vessels: the sheet's numbers under their own names. */
export interface MembraneBank {
  /** The sheet this was read from (unit, item): for labels and tooltips. */
  unit: string;
  item: string;
  /** Vessels in THIS bank (a train's, when the plant is trains). */
  vessels: number;
  elementsPerVessel: number;
  vesselsPerRack: number;
  tiers: number;
  vesselsPerTier: number;
  racks: number;
  vesselsLastRack: number;
  /** Metres. */
  elementLength: number;
  vesselEndAllowance: number;
  vesselLength: number;
  vesselOutsideDiameter: number;
  pitch: number;
  tierPitch: number;
  baseHeight: number;
  endMargin: number;
  rackAisle: number;
  rackLength: number;
  rackWidth: number;
  rackHeight: number;
  loadingClearance: number;
  envelopeLength: number;
  envelopeWidth: number;
  envelopeHeight: number;
  /** The header nominal diameter, m, when the case declared one on the sheet
   *  (`headerNominalDiameter`); undefined otherwise -- the headers are NOT
   *  sized (no pipe sizer exists) and the drawing says so. */
  headerNominalDiameter?: number;
  /** `trains` / `trainIndex` when the plant is sized per train. */
  trains?: number;
  trainIndex?: number;
}

export type BankRead =
  | { ok: true; bank: MembraneBank }
  | { ok: false; missing: string[] };

/** Read the bank off its sheet.  Never defaults: an absent or wrongly-united
 *  key is reported by NAME and the bank is not built. */
export function readBank(sheet: DesignSheet | null | undefined): BankRead {
  const missing: string[] = [];
  const get = (key: string, unit: "m" | "-"): number => {
    const v = sizingValue(sheet, key);
    if (!v || !Number.isFinite(v.value) || v.unit !== unit) { missing.push(key); return NaN; }
    return v.value;
  };
  const n = (k: string) => get(k, "-");
  const m = (k: string) => get(k, "m");
  const bank: MembraneBank = {
    unit: sheet?.unit ?? "", item: sheet?.item ?? "",
    vessels: n("vessels"), elementsPerVessel: n("elementsPerVessel"),
    vesselsPerRack: n("vesselsPerRack"), tiers: n("tiers"),
    vesselsPerTier: n("vesselsPerTier"), racks: n("racks"),
    vesselsLastRack: n("vesselsLastRack"),
    elementLength: m("elementLength"), vesselEndAllowance: m("vesselEndAllowance"),
    vesselLength: m("vesselLength"),
    vesselOutsideDiameter: m("vesselOutsideDiameter"), pitch: m("pitch"),
    tierPitch: m("tierPitch"), baseHeight: m("baseHeight"), endMargin: m("endMargin"),
    rackAisle: m("rackAisle"), rackLength: m("rackLength"), rackWidth: m("rackWidth"),
    rackHeight: m("rackHeight"), loadingClearance: m("loadingClearance"),
    envelopeLength: m("envelopeLength"), envelopeWidth: m("envelopeWidth"),
    envelopeHeight: m("envelopeHeight"),
  };
  if (missing.length > 0 || !sheet) return { ok: false, missing };
  const hd = sizingValue(sheet, "headerNominalDiameter");
  if (hd && hd.unit === "m" && hd.value > 0) bank.headerNominalDiameter = hd.value;
  const tr = sizingValue(sheet, "trains"), ti = sizingValue(sheet, "trainIndex");
  if (tr) bank.trains = tr.value;
  if (ti) bank.trainIndex = ti.value;
  //  Whole-number counts: a fractional one is a corrupt sheet, not a bank.
  for (const k of BANK_COUNT_KEYS)
    if (!Number.isInteger(Math.round(bank[k] * 1e6) / 1e6)) return { ok: false, missing: [k] };
  return { ok: true, bank };
}

/** The three headers of a rack. */
export type HeaderRole = "feed" | "brine" | "permeate";
export const HEADER_ROLES: readonly HeaderRole[] = ["feed", "brine", "permeate"];

/** One header, as its `pipeHeader` sheet states it (DEV.md 4c C199, the header
 *  sizer).  Every number is the sheet's, under its own name and unit. */
export interface BankHeader {
  role: HeaderRole;
  /** The nominal bore the sizer picked from the case's declared list, m. */
  diameter: number;
  /** The smallest bore that stays under the velocity window's top, m. */
  required: number;
  velocity: number;             // m/s
  pressureDropPerMetre: number; // Pa/m
  flow: number;                 // m3/h, per train
}
export type BankHeaders = { [R in HeaderRole]?: BankHeader };

/** Read one `pipeHeader` sheet.  Null when it lacks a key or carries it in a
 *  wrong unit -- never defaulted. */
export function readHeader(sheet: DesignSheet | null | undefined): BankHeader | null {
  if (!sheet || sheet.equipment !== "pipeHeader") return null;
  const role = sheet.item.split(".").pop() as HeaderRole;
  if (!HEADER_ROLES.includes(role)) return null;
  const get = (k: string, u: string): number | null => {
    const v = sizingValue(sheet, k);
    return v && v.unit === u && Number.isFinite(v.value) ? v.value : null;
  };
  const diameter = get("headerNominalDiameter", "m"), required = get("requiredInsideDiameter", "m"),
    velocity = get("velocity", "m/s"), dp = get("pressureDropPerMetre", "Pa/m"), flow = get("flow", "m3/h");
  if (diameter === null || diameter <= 0 || required === null || velocity === null || dp === null || flow === null)
    return null;
  return { role, diameter, required, velocity, pressureDropPerMetre: dp, flow };
}

/** The headers of ONE bank: the `pipeHeader` sheets whose unit is the bank's
 *  and whose `trainIndex` is the bank's (the engine's join: unit + train; the
 *  header sheets have no layout item of their own).  A role with no readable
 *  sheet is absent, and the drawing falls back to a labelled dashed mark. */
export function headersOf(sheets: readonly DesignSheet[], bank: MembraneBank): BankHeaders {
  const out: BankHeaders = {};
  for (const s of sheets) {
    if (s.equipment !== "pipeHeader" || s.unit !== bank.unit) continue;
    const ti = sizingValue(s, "trainIndex")?.value;
    if (bank.trainIndex !== undefined && ti !== undefined && Math.round(ti) !== Math.round(bank.trainIndex)) continue;
    const h = readHeader(s);
    if (h) out[h.role] = h;
  }
  return out;
}

/** One vessel's place, in the BANK frame (x along the vessels from the rack's
 *  start, y across from the first rack's edge, z up from the floor). */
export interface VesselPlace { rack: number; tier: number; col: number; x: number; y: number; z: number }

/** How many vessels rack `r` (0-based) holds: the full rack's, and the last
 *  rack's the sheet states. */
export function vesselsInRack(b: MembraneBank, r: number): number {
  return r === b.racks - 1 ? b.vesselsLastRack : b.vesselsPerRack;
}

/** The place of every vessel, rack by rack, bottom tier first. */
export function vesselPlaces(b: MembraneBank): VesselPlace[] {
  const out: VesselPlace[] = [];
  for (let r = 0; r < b.racks; r++) {
    const y0 = r * (b.rackWidth + b.rackAisle);
    const n = vesselsInRack(b, r);
    for (let i = 0; i < n; i++) {
      const tier = Math.floor(i / b.vesselsPerTier);
      const col = i % b.vesselsPerTier;
      out.push({
        rack: r, tier, col,
        x: b.endMargin + b.vesselLength / 2,
        y: y0 + (col + 0.5) * b.pitch,
        z: b.baseHeight + (tier + 0.5) * b.tierPitch,
      });
    }
  }
  return out;
}

/** The plan rectangle of rack `r` in the bank frame: x0..x1, y0..y1. */
export function rackRect(b: MembraneBank, r: number):
  { x0: number; x1: number; y0: number; y1: number } {
  const y0 = r * (b.rackWidth + b.rackAisle);
  return { x0: 0, x1: b.rackLength, y0, y1: y0 + b.rackWidth };
}

/** Consistency of the sheet with itself -- the arithmetic MembraneBankSize
 *  states in its header, recomputed.  Returns the problems found, empty when
 *  the sheet describes a bank that exists. */
export function bankProblems(b: MembraneBank): string[] {
  const p: string[] = [];
  const near = (a: number, c: number) => Math.abs(a - c) <= 1e-6 * Math.max(1, Math.abs(c));
  if (b.vesselsPerRack !== b.vesselsPerTier * b.tiers) p.push("vesselsPerRack != vesselsPerTier x tiers");
  if (b.vessels !== (b.racks - 1) * b.vesselsPerRack + b.vesselsLastRack)
    p.push("vessels != (racks-1) x vesselsPerRack + vesselsLastRack");
  if (!near(b.rackLength, b.vesselLength + 2 * b.endMargin)) p.push("rackLength != vesselLength + 2 endMargin");
  if (!near(b.rackWidth, b.vesselsPerTier * b.pitch)) p.push("rackWidth != vesselsPerTier x pitch");
  if (!near(b.rackHeight, b.baseHeight + b.tiers * b.tierPitch)) p.push("rackHeight != baseHeight + tiers x tierPitch");
  if (!near(b.envelopeLength, b.rackLength + b.loadingClearance)) p.push("envelopeLength != rackLength + loadingClearance");
  if (!near(b.envelopeWidth, b.racks * b.rackWidth + (b.racks - 1) * b.rackAisle))
    p.push("envelopeWidth != racks x rackWidth + (racks-1) x aisle");
  if (!near(b.envelopeHeight, b.rackHeight)) p.push("envelopeHeight != rackHeight");
  if (b.vesselOutsideDiameter > b.pitch + 1e-9 || b.vesselOutsideDiameter > b.tierPitch + 1e-9)
    p.push("vessels interpenetrate (outside diameter above the pitch)");
  return p;
}
