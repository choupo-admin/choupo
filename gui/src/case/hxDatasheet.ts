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
  hxDatasheet -- the shell-and-tube SPECIFICATION SHEET drawn from a Kern
  DESIGN (2026-10-07, DEV.md 4c C51).

  Vítor, on the green-ammonia FEHE pop-out: "O design continua uma merda!"
  Measured: the exchanger datasheet drew its schematic and its rating tables
  from the UNIT's KPIs and the unit's `geometry {}` -- which exist only when a
  `heatExchanger` runs `model geometry|design`.  The C48 design lives on the
  SIZER's sheet (`design/<unit>/shellTubeHX`, route 4), so all six exchangers
  of that plant would have drawn "tube count not declared", "0 baffles" and a
  table of dashes, with the design's fifty keys dumped raw beside them -- and
  five of the six are `phaseChanger` units the page never offered at all.

  THIS MODULE DRAWS THE SHEET, AND ONLY THE SHEET.  Every number is read from
  `sizing {}` in the unit the sizer declared (the D4 rule: an object declares
  its own dimensions); a value is converted only between units of ONE family
  that the dict's own unit table knows, and anything else is printed as the
  sheet wrote it.  Which fluid is in the tubes, which side is a utility,
  whether a side condenses or boils, whether a film was computed or declared,
  which keys the case declared and which were read from the unit or a record
  -- all of that is the ENGINE's decision, published in the sheet's
  `exchanger {}` block.  Nothing here parses the basis sentence for a fact,
  and nothing re-derives a design number: the basis is SHOWN, clause by
  clause, with the engine's own WARNING clauses set apart so they cannot be
  missed.

  EVERY VALUE CARRIES ITS PROVENANCE IN TWO CHANNELS -- the ink and the word
  (`case/equipmentSchematic.ts`, one vocabulary): Choupo / declared / from the
  unit / from a record.

  Pure and React-free (the fieldDisplay.ts / drillSeed.ts pattern), so the
  tests run it on the engine's real sheets.
\*---------------------------------------------------------------------------*/

import {
  lookupDesignSheet, type DesignPort, type DesignSheet, type DesignValue,
  type ExchangerSheet, type ExchangerSideSheet,
} from "./designSheet.js";
import { lookupUnit } from "../dict/units.js";
import { PROVENANCE_INK, PROVENANCE_WORD, type Provenance }
  from "./equipmentSchematic.js";

/*  ---- What a Kern design sheet is ------------------------------------- */

/** A sheet the exchanger datasheet can draw as a DESIGN: a `shellTubeHX`
 *  sheet that carries the engine's `exchanger {}` block and the bundle it
 *  describes.  Anything else -- an area-only sheet (routes 1-3), a column's
 *  condenser or reboiler -- is null, and the caller keeps its old page. */
export interface KernDesign {
  sheet: DesignSheet;
  x: ExchangerSheet;
}

const BUNDLE_KEYS = ["nTubes", "tubesPerPass", "tubePasses", "shellID",
                     "tubeOD", "tubeID", "tubeLength", "U", "A"] as const;

export function kernDesignOf(sheet: DesignSheet | null | undefined): KernDesign | null {
  if (!sheet || sheet.equipment !== "shellTubeHX" || !sheet.exchanger) return null;
  const has = new Set(sheet.sizing.map((v) => v.key));
  if (!BUNDLE_KEYS.every((k) => has.has(k))) return null;
  return { sheet, x: sheet.exchanger };
}

/** The Kern design the run wrote for `unitName`, or null -- read through the
 *  ONE sheet reader (`lookupDesignSheet`), never a second parse. */
export function findKernDesign(
  designFiles: { [relPath: string]: string } | undefined, unitName: string,
): KernDesign | null {
  return kernDesignOf(lookupDesignSheet(designFiles, unitName, "shellTubeHX").sheet);
}

/*  ---- Units: the sheet's own, converted only within a family ----------- */

/** The families a datasheet value is shown in.  A conversion happens only
 *  when BOTH the sheet's unit and the target belong to the same family AND
 *  the dict's unit table (`dict/units.ts`, the mirror of src/core/Units.cpp)
 *  knows both; otherwise the value is printed exactly as the sheet wrote it.
 *  A family is a guard against a factor that is numerically valid and
 *  physically wrong (a "kW" value asked for in "mm"). */
const FAMILY: { [unit: string]: string } = {
  m: "L", mm: "L", cm: "L", km: "L", in: "L", inch: "L", ft: "L",
  m2: "A", "m^2": "A", cm2: "A", mm2: "A",
  Pa: "P", kPa: "P", MPa: "P", bar: "P", atm: "P", psi: "P",
  "kg/s": "MF", "kg/h": "MF", "t/h": "MF", "g/s": "MF",
  "m/s": "V", "cm/s": "V", "mm/s": "V",
  W: "Q", kW: "Q", MW_power: "Q",
  kg: "M", t: "M", tonne: "M", ton: "M", g: "M",
  "W/m2/K": "H", "W/(m2.K)": "H", "W/m^2/K": "H", "W/(m^2.K)": "H",
  "kW/(m2.K)": "H", "kW/(m^2.K)": "H",
};

/** `v` in `target`, or undefined when the sheet's unit cannot be converted
 *  to it honestly (unknown, or another family). */
export function inUnit(v: DesignValue | undefined, target: string): number | undefined {
  if (!v) return undefined;
  if (v.unit === target) return v.value;
  const fa = FAMILY[v.unit], fb = FAMILY[target];
  if (!fa || fa !== fb) return undefined;
  const a = lookupUnit(v.unit), b = lookupUnit(target);
  if (!a || !b || a.affine || b.affine) return undefined;
  return (v.value * a.factor) / b.factor;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A number for a reader: fixed decimals where the magnitude makes them
 *  meaningful, exponent form where it does not. */
export function fmt(n: number, digits = 1): string {
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e7 || a < 1e-3) return n.toExponential(3);
  return n.toLocaleString("en-US", { minimumFractionDigits: digits,
                                     maximumFractionDigits: digits });
}

const UNIT_LABEL: { [u: string]: string } = {
  m2: "m²", "W/m2/K": "W/(m²·K)", "m2.K/W": "m²·K/W", "W/m/K": "W/(m·K)",
  "-": "", "": "",
};
const unitLabel = (u: string): string => UNIT_LABEL[u] ?? u;

/** A value as the sheet wrote it, in its own unit -- the fallback whenever a
 *  conversion is not honest. */
export function asWritten(v: DesignValue): string {
  const n = Number(v.value.toPrecision(6)).toString();
  const u = unitLabel(v.unit);
  return u ? `${n} ${u}` : n;
}

/** A temperature from a sheet value written in K, shown in °C.  Any other
 *  unit is printed as written -- never assumed to be kelvin. */
function celsiusOf(v: DesignValue | undefined): string | undefined {
  if (!v) return undefined;
  if (v.unit === "K") return `${(v.value - 273.15).toFixed(1)} °C`;
  return asWritten(v);
}
const cK = (k: number | undefined): string | undefined =>
  k === undefined ? undefined : `${(k - 273.15).toFixed(1)} °C`;

/*  ---- The view: the sheet, read once, with provenance ------------------ */

export interface Cell { text: string; who: Provenance | null; note?: string; }

export interface KernView {
  d: KernDesign;
  val: (key: string) => DesignValue | undefined;
  who: (key: string) => Provenance;
  /** `key` shown in `target` with `digits` decimals, or as written. */
  q: (key: string, target: string, digits?: number) => Cell | null;
  port: (stream: string) => DesignPort | undefined;
  nTubes: number;
  perPass: number;
  passes: number;
  shells: number;
  nBaffles: number;
  cooling: boolean;
}

export function kernView(d: KernDesign): KernView {
  const byKey = new Map(d.sheet.sizing.map((v) => [v.key, v] as const));
  const val = (k: string) => byKey.get(k);
  const who = (k: string): Provenance =>
    d.x.declared.includes(k) ? "declared"
    : d.x.fromUnit.includes(k) ? "unit"
    : d.x.fromRecord.includes(k) ? "record" : "choupo";
  const q = (k: string, target: string, digits = 1): Cell | null => {
    const v = val(k);
    if (!v) return null;
    const n = inUnit(v, target);
    const text = n === undefined ? asWritten(v)
      : `${fmt(n, digits)}${unitLabel(target) ? " " + unitLabel(target) : ""}`;
    return { text, who: who(k) };
  };
  const ports = [...d.sheet.inlets, ...d.sheet.outlets];
  const port = (s: string) => (s ? ports.find((p) => p.global === s) : undefined);
  const int = (k: string) => Math.round(val(k)?.value ?? 0);
  const Q = val("Q_kW")?.value ?? 0;
  return {
    d, val, who, q, port,
    nTubes: int("nTubes"), perPass: int("tubesPerPass"),
    passes: Math.max(1, int("tubePasses")),
    shells: Math.max(1, int("shellsInSeries") || 1),
    nBaffles: Math.max(0, int("nBaffles")),
    cooling: Q < 0,
  };
}

/*  ---- What flows on a side, as words ---------------------------------- */

const REGIME_WORD: { [r: string]: string } = {
  gas: "single-phase gas", liquid: "single-phase liquid",
  condensing: "partially CONDENSING", boils: "BOILS (latent)",
  condenses: "CONDENSES (latent)",
};

/** The fluid's name as the sheet names it: the stream pair of a process side,
 *  the utility record of a utility side. */
export function fluidName(s: ExchangerSideSheet): string {
  if (s.role === "utility") return s.utility || "utility";
  return s.inlet && s.outlet ? `${s.inlet} → ${s.outlet}` : (s.inlet || s.role);
}

function roleWord(s: ExchangerSideSheet): string {
  switch (s.role) {
    case "process": return "process stream";
    case "utility": return "utility";
    case "hot":     return "hot process stream";
    case "cold":    return "cold process stream";
    default:        return s.role || "—";
  }
}

/** Inlet / outlet temperature of a side: the PORTS for a process side, the
 *  utility RECORD's supply and return for a utility side. */
function sideT(v: KernView, s: ExchangerSideSheet): { tin?: Cell; tout?: Cell } {
  if (s.role === "utility")
    return {
      tin: s.Tin !== undefined ? { text: cK(s.Tin)!, who: "record" } : undefined,
      tout: s.Tout !== undefined ? { text: cK(s.Tout)!, who: "record" } : undefined,
    };
  const pi = v.port(s.inlet), po = v.port(s.outlet);
  return {
    tin: pi?.T !== undefined ? { text: cK(pi.T)!, who: "choupo" } : undefined,
    tout: po?.T !== undefined ? { text: cK(po.T)!, who: "choupo" } : undefined,
  };
}

/** The service in one line, from the engine's words: which roles, which
 *  regime, cooling or heating. */
export function serviceLine(v: KernView): string {
  const t = v.d.x.tube, s = v.d.x.shell;
  const util = t.role === "utility" ? t : s.role === "utility" ? s : null;
  const proc = util === t ? s : t;
  if (!util) return "Process/process interchanger (feed/effluent)";
  const what = proc.regime === "condensing" ? "Partial condenser"
             : v.cooling ? "Process cooler" : "Process heater";
  return `${what} against ${util.utility || "a utility"}`
    + (util.regime === "boils" ? " (boiling refrigerant)"
       : util.regime === "condenses" ? " (condensing utility)" : "");
}

/*  ---- The schematic ---------------------------------------------------- */

const INK = "#1f2933", STEEL = "#cfd8e0", STEEL_D = "#9fb0bf", TUBE = "#6b7c8d",
      HOT = "#c8553d", COLD = "#2f6fb0", BAFFLE = "#46525e";

function tx(x: number, y: number, s: string, fill = INK, size = 11,
            anchor: "start" | "middle" | "end" = "start", weight = 400): string {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" `
    + `font-family="Helvetica,Arial,sans-serif" font-weight="${weight}" `
    + `text-anchor="${anchor}">${esc(s)}</text>`;
}

/** A label whose provenance is stated in ink and in words. */
function txw(x: number, y: number, s: string, who: Provenance, size = 11,
             anchor: "start" | "middle" | "end" = "start"): string {
  return `<text x="${x}" y="${y}" font-size="${size}" `
    + `font-family="Helvetica,Arial,sans-serif" text-anchor="${anchor}">`
    + `<tspan fill="${PROVENANCE_INK[who]}" font-weight="600">${esc(s)}</tspan>`
    + `<tspan fill="${PROVENANCE_INK[who]}" font-style="italic" font-size="${size - 2}">`
    + ` (${esc(PROVENANCE_WORD[who])})</tspan></text>`;
}

function arrow(x1: number, y1: number, x2: number, y2: number, c: string, w = 2): string {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 8;
  const p1 = `${x2 - L * Math.cos(a - 0.4)},${y2 - L * Math.sin(a - 0.4)}`;
  const p2 = `${x2 - L * Math.cos(a + 0.4)},${y2 - L * Math.sin(a + 0.4)}`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`
    + `<polygon points="${x2},${y2} ${p1} ${p2}" fill="${c}"/>`;
}

/** The temperature colour of a side: hot is the side whose INLET is warmer. */
function sideColours(v: KernView): { tube: string; shell: string } {
  const tin = (s: ExchangerSideSheet) =>
    s.role === "utility" ? s.Tin : v.port(s.inlet)?.T;
  const tT = tin(v.d.x.tube), tS = tin(v.d.x.shell);
  if (tT === undefined || tS === undefined) return { tube: COLD, shell: HOT };
  return tT >= tS ? { tube: HOT, shell: COLD } : { tube: COLD, shell: HOT };
}

/** A shell-and-tube drawn from the DESIGN: the real pass arrangement (a
 *  single straight pass with heads at both ends, or an even number of passes
 *  turned by partition plates in the front channel and the rear head -- the
 *  head TYPE is not designed by Choupo and is not drawn as one), the real
 *  number of segmental baffles, the shell ID and tube length dimensioned, the
 *  shells in series, and each nozzle labelled with its fluid and temperature.
 *  The tube count is WRITTEN, not drawn tube by tube: a bundle of 2204 tubes
 *  drawn to count is a grey rectangle. */
export function kernSchematicSvg(v: KernView): string {
  const x = v.d.x;
  const top = v.shells > 1 ? 66 : 0;                     // room for the series strip
  const W = 1040;
  const p: string[] = [];
  const col = sideColours(v);
  const shX = 260, shY = 120 + top, shW = 520, shH = 190; // shell body
  const H = shY + shH + 250;
  const fhW = 70, rhW = v.passes === 1 ? 70 : 46;        // head depths
  const P = v.passes;

  // ---- shells in series strip (when more than one) ----
  if (v.shells > 1) {
    const n = v.shells, bw = 64, bh = 22, gap = 26;
    const x0 = W / 2 - (n * bw + (n - 1) * gap) / 2, y0 = 18;
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * (bw + gap);
      p.push(`<rect x="${bx}" y="${y0}" width="${bw}" height="${bh}" rx="9" `
        + `fill="${STEEL}" stroke="${INK}" stroke-width="1.2"/>`);
      p.push(tx(bx + bw / 2, y0 + 15, `shell ${i + 1}`, INK, 10, "middle"));
      if (i < n - 1) p.push(arrow(bx + bw + 2, y0 + bh / 2, bx + bw + gap - 2, y0 + bh / 2, INK, 1.4));
    }
    p.push(txw(W / 2, y0 + bh + 18,
      `${n} identical shells in counter-current series — the one drawn below is ONE of them`,
      v.who("shellsInSeries"), 11, "middle"));
  }

  // ---- shell body ----
  p.push(`<rect x="${shX}" y="${shY}" width="${shW}" height="${shH}" `
    + `fill="${STEEL}" stroke="${INK}" stroke-width="1.8"/>`);
  // front channel (left)
  p.push(`<path d="M${shX} ${shY - 8} h-${fhW - 14} a14 14 0 0 0 -14 14 v${shH - 12} `
    + `a14 14 0 0 0 14 14 h${fhW - 14} z" fill="#e3e9ef" stroke="${INK}" stroke-width="1.8"/>`);
  // rear head (right)
  p.push(`<path d="M${shX + shW} ${shY - 8} h${rhW - 14} a14 14 0 0 1 14 14 v${shH - 12} `
    + `a14 14 0 0 1 -14 14 h-${rhW - 14} z" fill="#e3e9ef" stroke="${INK}" stroke-width="1.8"/>`);
  // tubesheets
  for (const xs of [shX, shX + shW])
    p.push(`<line x1="${xs}" y1="${shY - 8}" x2="${xs}" y2="${shY + shH + 8}" `
      + `stroke="${INK}" stroke-width="4"/>`);

  // ---- pass lanes ----
  const laneH = shH / P;
  const tubesPerLane = Math.min(4, Math.max(2, Math.floor(laneH / 9)));
  for (let k = 0; k < P; k++) {
    const y0 = shY + k * laneH;
    for (let j = 0; j < tubesPerLane; j++) {
      const yy = y0 + ((j + 1) * laneH) / (tubesPerLane + 1);
      p.push(`<line x1="${shX + 2}" y1="${yy}" x2="${shX + shW - 2}" y2="${yy}" `
        + `stroke="${TUBE}" stroke-width="1.3"/>`);
    }
    // flow direction in this pass: pass 1 runs front -> rear
    const yy = y0 + laneH / 2;
    const ltr = k % 2 === 0;
    const xm = shX + shW * (ltr ? 0.05 : 0.95);
    p.push(arrow(ltr ? xm - 18 : xm + 18, yy, ltr ? xm + 18 : xm - 18, yy, col.tube, 2.2));
    p.push(tx(ltr ? xm + 24 : xm - 24, yy + 4, `pass ${k + 1}`, col.tube, 10,
              ltr ? "start" : "end", 600));
  }
  // pass partitions: front channel between passes 1|2, 3|4, ... are turns at
  // the REAR; the front carries the partitions between 2|3, 4|5 ... and the
  // in/out split.  For P passes the front has P/2 + 1 compartments (inlet,
  // turns, outlet) and the rear P/2.
  if (P >= 2) {
    for (let k = 1; k < P; k++) {
      const yy = shY + k * laneH;
      // boundary k separates pass k and k+1: passes k,k+1 turn at the rear
      // when k is odd (pass k runs front->rear), so the FRONT is partitioned
      // there; when k is even they turn at the front, so the REAR is.
      const front = k % 2 === 1;
      if (front) p.push(`<line x1="${shX - fhW + 2}" y1="${yy}" x2="${shX}" y2="${yy}" `
        + `stroke="${INK}" stroke-width="3"/>`);
      else p.push(`<line x1="${shX + shW}" y1="${yy}" x2="${shX + shW + rhW - 2}" y2="${yy}" `
        + `stroke="${INK}" stroke-width="3"/>`);
    }
  }

  // ---- baffles ----
  const nB = v.nBaffles;
  const nDraw = Math.min(nB, 40);
  for (let b = 0; b < nDraw; b++) {
    const xb = shX + ((b + 1) * shW) / (nDraw + 1);
    const top = b % 2 === 0;
    const y0 = top ? shY + shH * 0.25 : shY;
    const y1 = top ? shY + shH : shY + shH * 0.75;
    p.push(`<line x1="${xb}" y1="${y0}" x2="${xb}" y2="${y1}" stroke="${BAFFLE}" stroke-width="3"/>`);
  }

  // ---- nozzles ----
  const nz = (cx: number, cy: number, up: boolean, c: string) =>
    `<rect x="${cx - 13}" y="${up ? cy - 30 : cy}" width="26" height="30" `
    + `fill="${c}" stroke="${INK}" stroke-width="1.2"/>`;
  // shell nozzles: in at the end where the tube side LEAVES, for counter-flow
  // in the last pass; drawn as in top-right / out bottom-left for an odd pass
  // count (tubes leave at the rear) and top-left/bottom-right otherwise.
  const tubeOutRear = P % 2 === 1;
  const shInX = tubeOutRear ? shX + shW - 50 : shX + 50;
  const shOutX = tubeOutRear ? shX + 50 : shX + shW - 50;
  p.push(nz(shInX, shY - 8, true, col.shell));
  p.push(nz(shOutX, shY + shH + 8, false, col.shell));
  // tube nozzles
  const tInY = shY + laneH / 2;
  const tOutY = shY + shH - laneH / 2;
  const tInX = shX - fhW - 26;
  p.push(`<rect x="${tInX}" y="${tInY - 12}" width="26" height="24" fill="${col.tube}" stroke="${INK}" stroke-width="1.2"/>`);
  const tOutX = tubeOutRear ? shX + shW + rhW : tInX;
  p.push(`<rect x="${tOutX}" y="${tOutY - 12}" width="26" height="24" fill="${col.tube}" stroke="${INK}" stroke-width="1.2"/>`);

  // ---- nozzle labels: fluid + temperature ----
  const tT = sideT(v, x.tube), tS = sideT(v, x.shell);
  const lbl = (xx: number, yy: number, head: string, name: string, t: Cell | undefined,
               c: string, anchor: "start" | "end" | "middle") => {
    p.push(tx(xx, yy, head, c, 11, anchor, 700));
    p.push(tx(xx, yy + 14, name, INK, 11, anchor));
    if (t) p.push(txw(xx, yy + 28, t.text, t.who!, 11, anchor));
  };
  const inName = (sd: ExchangerSideSheet) =>
    sd.role === "utility" ? `${sd.utility || "utility"} supply` : (sd.inlet || sd.role);
  const outName = (sd: ExchangerSideSheet) =>
    sd.role === "utility" ? `${sd.utility || "utility"} return` : (sd.outlet || sd.role);
  lbl(shInX, shY - 78, "SHELL IN", inName(x.shell), tS.tin, col.shell, "middle");
  lbl(shOutX, shY + shH + 54, "SHELL OUT", outName(x.shell), tS.tout, col.shell, "middle");
  lbl(tInX - 8, tInY - 12, "TUBE IN", inName(x.tube), tT.tin, col.tube, "end");
  if (tubeOutRear)
    lbl(tOutX + 26, shY + shH + 32, "TUBE OUT", outName(x.tube), tT.tout, col.tube, "end");
  else
    lbl(tInX - 8, tOutY - 12, "TUBE OUT", outName(x.tube), tT.tout, col.tube, "end");

  // ---- the bundle, in words, on the shell ----
  const cnt = `${v.nTubes} tubes = ${v.perPass} per pass × ${P} pass${P === 1 ? "" : "es"}`;
  p.push(`<rect x="${shX + shW / 2 - 162}" y="${shY + shH / 2 - 22}" width="324" height="44" `
    + `rx="6" fill="#ffffff" fill-opacity="0.92" stroke="${STEEL_D}"/>`);
  p.push(txw(shX + shW / 2, shY + shH / 2 - 4, cnt, v.who("nTubes"), 13, "middle"));
  p.push(txw(shX + shW / 2, shY + shH / 2 + 14,
    `${nB} segmental baffle${nB === 1 ? "" : "s"}`
    + (nB > nDraw ? ` (${nDraw} drawn)` : ""), v.who("nBaffles"), 11, "middle"));

  // ---- dimensions ----
  const dimY = shY + shH + 118;
  const L = v.q("tubeLength", "mm", 0);
  p.push(`<line x1="${shX}" y1="${dimY - 8}" x2="${shX}" y2="${dimY + 8}" stroke="${INK}"/>`);
  p.push(`<line x1="${shX + shW}" y1="${dimY - 8}" x2="${shX + shW}" y2="${dimY + 8}" stroke="${INK}"/>`);
  p.push(arrow(shX + shW / 2, dimY, shX + 2, dimY, INK, 1));
  p.push(arrow(shX + shW / 2, dimY, shX + shW - 2, dimY, INK, 1));
  if (L) p.push(txw(shX + shW / 2, dimY - 6, `tube length L = ${L.text}`, L.who!, 11, "middle"));
  const B = v.q("baffleSpacing", "mm", 0);
  if (B) p.push(txw(shX + shW / 2, dimY + 20, `baffle spacing B = ${B.text}`, B.who!, 11, "middle"));

  const dX = shX + shW + rhW + 70;
  p.push(`<line x1="${dX - 8}" y1="${shY}" x2="${dX + 8}" y2="${shY}" stroke="${INK}"/>`);
  p.push(`<line x1="${dX - 8}" y1="${shY + shH}" x2="${dX + 8}" y2="${shY + shH}" stroke="${INK}"/>`);
  p.push(arrow(dX, shY + shH / 2, dX, shY + 2, INK, 1));
  p.push(arrow(dX, shY + shH / 2, dX, shY + shH - 2, INK, 1));
  const D = v.q("shellID", "mm", 0);
  if (D) {
    p.push(tx(dX + 8, shY + shH / 2 - 6, "shell ID", INK, 11));
    p.push(txw(dX + 8, shY + shH / 2 + 10, D.text, D.who!, 11));
  }

  // ---- tube-layout inset ----
  const ix = 70, iy = shY + shH + 190, R = 44;
  const tri = x.tubePattern === "triangular";
  p.push(`<circle cx="${ix}" cy="${iy}" r="${R}" fill="${STEEL}" stroke="${INK}" stroke-width="1.5"/>`);
  const pitch = 13, rt = 4.6;
  for (let r = -4; r <= 4; r++)
    for (let c = -4; c <= 4; c++) {
      const cx = ix + c * pitch + (tri && r % 2 !== 0 ? pitch / 2 : 0);
      const cy = iy + r * pitch * (tri ? Math.sqrt(3) / 2 : 1);
      if ((cx - ix) ** 2 + (cy - iy) ** 2 < (R - 8) ** 2)
        p.push(`<circle cx="${cx}" cy="${cy}" r="${rt}" fill="#fff" stroke="${TUBE}" stroke-width="1"/>`);
    }
  p.push(tx(ix + R + 12, iy - 18, `tube layout: ${x.tubePattern || "—"} pitch`, INK, 11, "start", 600));
  const od = v.q("tubeOD", "mm", 2), pt = v.q("tubePitch", "mm", 2);
  if (pt) p.push(txw(ix + R + 12, iy - 2, `pitch ${pt.text}`, pt.who!, 11));
  if (od) p.push(txw(ix + R + 12, iy + 14, `tube OD ${od.text}`, od.who!, 11));
  p.push(tx(ix + R + 12, iy + 30, "(pattern only — not drawn to count)", "#5b6670", 10));

  // ---- legend ----
  const lx = W - 300, ly = shY + shH + 170;
  (["choupo", "declared", "record", "unit"] as Provenance[]).forEach((w, i) => {
    p.push(`<rect x="${lx}" y="${ly + i * 16 - 9}" width="10" height="10" fill="${PROVENANCE_INK[w]}"/>`);
    p.push(tx(lx + 16, ly + i * 16, `${PROVENANCE_WORD[w]}`, PROVENANCE_INK[w], 11, "start", 600));
  });
  p.push(tx(lx + 110, ly, "computed by this run", "#5b6670", 10));
  p.push(tx(lx + 110, ly + 16, "written by the case", "#5b6670", 10));
  p.push(tx(lx + 110, ly + 32, "a material / utility record", "#5b6670", 10));
  p.push(tx(lx + 110, ly + 48, "the rating unit's own", "#5b6670", 10));

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" `
    + `role="img" aria-label="shell-and-tube exchanger schematic">${p.join("")}</svg>`;
}

/*  ---- The page ---------------------------------------------------------- */

const tag = (who: Provenance | null): string =>
  who ? ` <span class="pv" style="color:${PROVENANCE_INK[who]}">${esc(PROVENANCE_WORD[who])}</span>` : "";

const cellHtml = (c: Cell | null | undefined): string =>
  !c ? `<span class="na">—</span>`
     : `<span style="color:${c.who ? PROVENANCE_INK[c.who] : INK}">${esc(c.text)}</span>${tag(c.who)}`
       + (c.note ? `<div class="cn">${esc(c.note)}</div>` : "");

const row2 = (label: string, c: Cell | null | undefined): string =>
  `<tr><th>${esc(label)}</th><td>${cellHtml(c)}</td></tr>`;

const row3 = (label: string, t: Cell | null | undefined, s: Cell | null | undefined): string =>
  `<tr><th>${esc(label)}</th><td>${cellHtml(t)}</td><td>${cellHtml(s)}</td></tr>`;

const section = (title: string, body: string, cols = 2, heads?: [string, string]): string =>
  `<table class="ds"><thead><tr><th colspan="${cols}" class="sec">${esc(title)}</th></tr>`
  + (heads ? `<tr class="sub"><th></th><th>${esc(heads[0])}</th><th>${esc(heads[1])}</th></tr>` : "")
  + `</thead><tbody>${body}</tbody></table>`;

const word = (text: string, who: Provenance | null = "choupo", note?: string): Cell =>
  ({ text, who, note });

/** One side's column of the PERFORMANCE table. */
function sideCells(v: KernView, side: "tube" | "shell") {
  const s = side === "tube" ? v.d.x.tube : v.d.x.shell;
  const k = (base: string) => `${base}_${side}`;
  const T = sideT(v, s);
  const pIn = v.port(s.inlet);
  const total: Cell | null = s.role === "utility"
    ? v.q("mdot_utility", "kg/s", 2)
    : pIn?.mdot !== undefined ? word(`${fmt(pIn.mdot, 2)} kg/s`) : null;
  const film = v.q(k("mdot"), "kg/s", 2);
  const filmNote = s.regime === "condensing" && film
    ? { ...film, note: "the gas that LEAVES — the film is put on it, the condensate film is not credited" }
    : film;
  const declaredFilm = s.film === "declared";
  const noCorr = declaredFilm ? word("— (film declared)", null) : null;
  return {
    fluid: word(fluidName(s), s.role === "utility" ? "declared" : null),
    role: word(roleWord(s), null),
    regime: word(REGIME_WORD[s.regime] ?? s.regime, "choupo"),
    total, film: filmNote, tin: T.tin, tout: T.tout,
    tprops: (() => { const key = `T_${side}_props`; const c = celsiusOf(v.val(key)); return c ? word(c, v.who(key)) : null; })(),
    u: v.q(k("u"), "m/s", 2) ?? noCorr,
    re: v.q(k("Re"), "-", 0) ?? noCorr,
    pr: v.q(k("Pr"), "-", 3) ?? noCorr,
    nu: v.q(k("Nu"), "-", 1) ?? noCorr,
    corr: declaredFilm ? word("declared coefficient (author-set)", "declared")
                       : word(s.correlation || "—", "choupo"),
    h: v.q(k("h"), "W/m2/K", 0),
    foul: v.q(`R_foul_${side}`, "m2.K/W", 5),
    dp: v.q(`dP_${side}`, "kPa", 2)
      ?? word(declaredFilm ? "not computed — a declared film has no flow model"
                           : "not computed", null),
  };
}

/** The basis as the engine wrote it, one clause per line, its WARNING clauses
 *  set apart.  Splitting on the engine's own clause separator is
 *  presentation: no clause is reworded, dropped or interpreted. */
export function basisClauses(basis: string): { text: string; warning: boolean }[] {
  //  Split on "; " at bracket depth 0 only: a clause may carry its own
  //  parenthesised aside with a semicolon in it, and cutting there would
  //  print half a sentence as a clause.
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < basis.length; i++) {
    const ch = basis[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((c) => c.trim()).filter((c) => c !== "")
    .map((c) => ({ text: c.replace(/^WARNING:\s*/, ""), warning: /^WARNING:/.test(c) }));
}

export function kernDatasheetHtml(unitName: string, d: KernDesign): string {
  const v = kernView(d);
  const x = d.x, sh = d.sheet;
  const T = sideCells(v, "tube"), S = sideCells(v, "shell");
  const clauses = basisClauses(sh.basis);
  const warnings = clauses.filter((c) => c.warning);
  const condensing = [x.tube, x.shell].some((s) => s.regime === "condensing");
  const latentUtility = [x.tube, x.shell].find((s) => s.regime === "boils" || s.regime === "condenses");

  //  ---- banners: the condensing statement and the warnings, at the top ----
  const condenseClause = clauses.find((c) => / CONDENSES /.test(c.text));
  const banners: string[] = [];
  if (condensing)
    banners.push(`<div class="ban amber"><b>Condensing duty — designed on the gas film.</b> `
      + `${esc(condenseClause?.text ?? "The process side condenses; see the design basis.")}</div>`);
  if (latentUtility)
    banners.push(`<div class="ban amber"><b>${esc(latentUtility.utility)} ${latentUtility.regime === "boils" ? "boils" : "condenses"} on the ${latentUtility === x.tube ? "tube" : "shell"} side:</b> `
      + `its film coefficient is DECLARED by the case (no correlation), and no pressure drop is computed on that side.</div>`);
  if (warnings.length > 0)
    banners.push(`<div class="ban red"><b>${warnings.length} validity warning${warnings.length === 1 ? "" : "s"} from the sizer:</b>`
      + `<ul>${warnings.map((w) => `<li>${esc(w.text)}</li>`).join("")}</ul></div>`);

  //  ---- SERVICE ----
  const service = section("SERVICE", [
    row2("Unit", word(sh.unit || unitName, null)),
    ...(sh.sector ? [row2("Sector", word(sh.sector, null))] : []),
    row2("Service", word(serviceLine(v), "choupo")),
    row2("Type", word(`Shell-and-tube, ${v.shells} shell${v.shells === 1 ? "" : "s"}`
      + `${v.shells > 1 ? " in counter-current series" : ""}, ${v.passes} tube pass${v.passes === 1 ? "" : "es"} per shell`,
      v.who("tubePasses"), "the head types (TEMA letters) are not designed by Choupo")),
    row2("Material", word(sh.material, "declared")),
    row2("Design pressure", v.q("pressureDesign", "bar", 0)),
  ].join(""));

  //  ---- THERMAL DESIGN ----
  const rated = v.val("A_rated") !== undefined;
  const costedOn = sh.cost?.sizeKey;
  const aCell = v.q("A", "m2", 1);
  const thermal = section("THERMAL DESIGN (Kern)", [
    row2("Heat duty Q", (() => { const c = v.q("Q_kW", "kW", 1); return c ? { ...c, note: v.cooling ? "negative: heat leaves the process side" : undefined } : null; })()),
    row2("LMTD (counter-current)", v.q("LMTD", "K", 2)),
    row2("Correction F", v.q("F", "-", 3)),
    row2("U, clean", v.q("U_clean", "W/m2/K", 1)),
    row2("U, service (with fouling)", v.q("U", "W/m2/K", 1)),
    row2("Area required = Q/(U·F·LMTD)", v.q("A_required", "m2", 1)),
    row2("Area installed (all shells)", aCell && costedOn === "A"
      ? { ...aCell, note: "this is the area the cost below is priced on" } : aCell),
    row2("Overdesign", (() => { const o = v.val("overdesign"); return o ? word(`${(o.value * 100).toFixed(2)} %`, v.who("overdesign")) : null; })()),
    ...(rated ? [
      row2("Rated area of the unit", (() => { const c = v.q("A_rated", "m2", 1); return c ? { ...c, note: "the flowsheet converged on this area and its U — NOT costed; the design above is" } : null; })()),
      row2("Rated U of the unit", v.q("U_rated", "W/m2/K", 1)),
    ] : []),
  ].join(""));

  //  ---- PERFORMANCE: tube side | shell side ----
  const perf = section("PERFORMANCE", [
    row3("Fluid", T.fluid, S.fluid),
    row3("Role", T.role, S.role),
    row3("Phase regime", T.regime, S.regime),
    row3("Total mass flow", T.total, S.total),
    row3("Flow the film is evaluated on", T.film, S.film),
    row3("Temperature in", T.tin, S.tin),
    row3("Temperature out", T.tout, S.tout),
    row3("Properties evaluated at", T.tprops, S.tprops),
    row3("Velocity", T.u, S.u),
    row3("Reynolds number", T.re, S.re),
    row3("Prandtl number", T.pr, S.pr),
    row3("Nusselt number", T.nu, S.nu),
    row3("Film correlation", T.corr, S.corr),
    row3("Film coefficient h", T.h, S.h),
    row3("Fouling resistance", T.foul, S.foul),
    row3("Pressure drop (all shells)", T.dp, S.dp),
  ].join(""), 3, ["TUBE SIDE", "SHELL SIDE"]);

  //  ---- RESISTANCES ----
  const ctrl = x.controlling;
  const resist = section("RESISTANCES (on the outside tube area)", [
    row2("Tube film", v.q("R_film_tube", "m2.K/W", 6)),
    row2("Tube-side fouling", (() => { const c = v.q("R_foul_tube", "m2.K/W", 6); return c ? { ...c, note: "declared on the INSIDE area; the design refers it to the outside by d_o/d_i" } : null; })()),
    row2("Tube wall", v.q("R_wall", "m2.K/W", 6)),
    row2("Shell-side fouling", v.q("R_foul_shell", "m2.K/W", 6)),
    row2("Shell film", v.q("R_film_shell", "m2.K/W", 6)),
    row2("Controlling (largest clean resistance)", ctrl ? word(ctrl, "choupo") : null),
  ].join(""));

  //  ---- CONSTRUCTION ----
  const construction = section("CONSTRUCTION — ONE SHELL", [
    row2("Number of tubes", v.q("nTubes", "-", 0)),
    row2("Tubes per pass", v.q("tubesPerPass", "-", 0)),
    row2("Tube passes", v.q("tubePasses", "-", 0)),
    row2("Shells in series", v.q("shellsInSeries", "-", 0)),
    row2("Tube OD", v.q("tubeOD", "mm", 2)),
    row2("Tube ID", v.q("tubeID", "mm", 2)),
    row2("Tube length", v.q("tubeLength", "mm", 0)),
    row2("Tube pitch", (() => { const c = v.q("tubePitch", "mm", 2); return c ? { ...c, text: `${c.text}, ${x.tubePattern}` } : null; })()),
    row2("Shell inside diameter", v.q("shellID", "mm", 0)),
    row2("Bundle-to-shell clearance", v.q("shellClearance", "mm", 0)),
    row2("Baffle spacing", v.q("baffleSpacing", "mm", 0)),
    row2("Number of baffles (segmental)", v.q("nBaffles", "-", 0)),
    row2("Equivalent diameter (shell side)", v.q("D_e", "mm", 2)),
    row2("Wall conductivity", v.q("wallK", "W/m/K", 1)),
    row2("Weight (all shells)", v.q("weight", "kg", 0)),
  ].join(""));

  //  ---- COST ----
  const c = sh.cost;
  const fac = (k: string) => c?.factors.find((f) => f.key === k);
  const money = (n: number | undefined) => n === undefined ? null
    : word(`${fmt(n, 0)} ${c?.currency ?? ""}`.trim(), "choupo");
  const cost = c ? section("COST", [
    row2("Correlation", word(`${c.correlation || "—"} on ${c.sizeKey || "—"}`
      + (fac("S") ? ` = ${fmt(fac("S")!.value, 1)}` : ""), "choupo")),
    row2("Purchased (C_p)", money(c.purchased)),
    row2("Material factor F_M", fac("F_M") ? word(fmt(fac("F_M")!.value, 2)) : null),
    row2("Pressure factor F_P", fac("F_P") ? word(fmt(fac("F_P")!.value, 3)) : null),
    row2("Bare module (C_BM)", money(c.bareModule)),
    row2("Total module (C_TM)", money(c.totalModule)),
  ].join("")) : section("COST", `<tr><td colspan="2">No costing pass priced this item.</td></tr>`);

  //  ---- BASIS ----
  const basis = `<div class="basis"><div class="bt">DESIGN BASIS — as the sizer wrote it</div><ol>`
    + clauses.map((cl) => `<li class="${cl.warning ? "w" : / CONDENSES /.test(cl.text) ? "a" : ""}">`
      + `${cl.warning ? "<b>WARNING:</b> " : ""}${esc(cl.text)}</li>`).join("")
    + `</ol></div>`;

  const title = `${esc(sh.unit || unitName)} — shell-and-tube specification sheet`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root{color-scheme:light}
  body{font-family:Helvetica,Arial,sans-serif;margin:22px auto;max-width:1060px;padding:0 16px;color:#1f2933;background:#fff}
  .hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1f2933;padding-bottom:6px;margin-bottom:12px}
  .hdr h1{font-size:20px;margin:0;letter-spacing:.02em}
  .hdr .id{font-size:12px;color:#3d4852;text-align:right}
  .scheme{border:1px solid #c9d2da;border-radius:6px;padding:8px;margin-bottom:12px;background:#fbfcfd}
  .ban{border-radius:5px;padding:7px 10px;margin:0 0 8px;font-size:12.5px;line-height:1.4}
  .ban ul{margin:4px 0 0 18px;padding:0}
  .amber{background:#fff6e0;border:1px solid #e0b34a;color:#4a3500}
  .red{background:#fdecea;border:1px solid #d9796a;color:#5c1a10}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
  .full{grid-column:1/-1}
  table.ds{width:100%;border-collapse:collapse;font-size:12.5px;border:1px solid #9aa7b4}
  table.ds th.sec{background:#1f2933;color:#fff;text-align:left;padding:5px 8px;letter-spacing:.06em;font-size:12px}
  table.ds tr.sub th{background:#e8edf1;color:#1f2933;font-size:11.5px;text-align:left;padding:4px 8px;border-bottom:1px solid #9aa7b4}
  table.ds tbody th{font-weight:500;color:#3d4852;text-align:left;padding:4px 8px;width:36%;border-bottom:1px solid #e3e8ec;vertical-align:top}
  table.ds td{padding:4px 8px;border-bottom:1px solid #e3e8ec;border-left:1px solid #e3e8ec;vertical-align:top;font-variant-numeric:tabular-nums}
  .pv{font-size:10.5px;font-style:italic;margin-left:3px}
  .cn{font-size:10.5px;color:#5b6670;margin-top:2px}
  .na{color:#9aa7b4}
  .basis{border:1px solid #9aa7b4;margin-top:12px;font-size:12px}
  .basis .bt{background:#1f2933;color:#fff;padding:5px 8px;letter-spacing:.06em;font-weight:700}
  .basis ol{margin:6px 0 8px 22px;padding:0 8px 0 0;line-height:1.45}
  .basis li.w{color:#8a1c0c}
  .basis li.a{color:#6b4a00}
  .foot{margin-top:12px;color:#5b6670;font-size:11px;line-height:1.45}
  @media print{body{margin:6mm auto} .noprint{display:none} .scheme{break-inside:avoid} table.ds{break-inside:avoid}}
</style></head><body>
  <div class="hdr"><h1>SHELL-AND-TUBE HEAT EXCHANGER — SPECIFICATION SHEET</h1>
    <div class="id">Item <b>${esc(sh.unit || unitName)}</b>${sh.sector ? ` · sector ${esc(sh.sector)}` : ""}<br>${esc(serviceLine(v))}<br>Choupo · Kern design read from <code>design/…/${esc(sh.unit || unitName)}/shellTubeHX</code></div></div>
  ${banners.join("\n  ")}
  <div class="scheme">${kernSchematicSvg(v)}</div>
  <div class="grid">
    <div>${service}</div>
    <div>${thermal}</div>
    <div class="full">${perf}</div>
    <div>${construction}</div>
    <div>${resist}${cost}</div>
  </div>
  ${basis}
  <div class="foot">EVERY NUMBER SAYS WHERE IT CAME FROM, in ink and in words:
    <b style="color:${PROVENANCE_INK.choupo}">Choupo</b> — computed by this run's design;
    <b style="color:${PROVENANCE_INK.declared}">declared</b> — written in the case's <code>system/postDict</code>;
    <b style="color:${PROVENANCE_INK.record}">from a record</b> — read from a material or utility record;
    <b style="color:${PROVENANCE_INK.unit}">from the unit</b> — the rating unit's own number, which the flowsheet converged on.
    Nothing on this page is recomputed by the browser: every value is the
    specification sheet the run wrote, in the unit its sizer declared.
    Print → PDF with your browser.</div>
  <p class="noprint" style="margin-top:12px"><button onclick="window.print()">Print / Save as PDF</button></p>
</body></html>`;
}
