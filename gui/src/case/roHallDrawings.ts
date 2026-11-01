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
  roHallDrawings -- THE USUAL DRAWING SET OF A REVERSE-OSMOSIS HALL, drawn
  from what the run published (DEV.md 4c C199 phase B; Vitor: "faz como achares
  mais de acordo com as boas praticas"):

    * the PLAN of the hall   -- rooms, racks, pumps, exchanger arrays, the
                                loading clearances hatched, the cut line;
    * the SECTION through a rack bay -- the vessels in tiers, the vessel
                                diameter, the base height, the headroom to the
                                roof from the room height;
    * the ELEVATION OF ONE RACK with its three headers (feed, brine,
                                permeate) and the connection of every vessel
                                to them, beside the rack seen from above.

  THE DESIGN OF THE SCREEN comes from the user's task (CLAUDE.md 10, "design a
  screen from the user's task"): an engineer sizing a seawater RO hall asks how
  the plant is ORGANISED and how one rack is BUILT.  So each drawing answers one
  of those, from the published geometry alone, and says on its face what it does
  not know.

  THE RULES, EACH PAID FOR ELSEWHERE IN THIS PROJECT.
    * No number is typed here.  Every length is a key of a `membraneBank` sheet
      (membraneBank.ts), a layout item's published box, or a room of the
      declared building.  A missing one draws a LABELLED BOX naming the key
      (`missingSvg`), never a guess.
    * Every DIMENSION LINE carries its provenance in TWO channels -- the ink
      and the word in brackets -- exactly as the pressure exchanger's schematic
      does (`PROVENANCE_INK` / `PROVENANCE_WORD`): what the case declared, what
      Choupo computed, what a record supplied.  Each is a `<g data-dim data-who>`
      so a test (and a reader of the source) can find it.
    * THE HEADERS ARE DRAWN AT THEIR OWN SIZE (C199, the header sizer): each
      of the feed, brine and permeate headers is read from ITS `pipeHeader`
      sheet (unit = the bank, tag `train<k>.<role>`; `headersOf`) and drawn at
      its own `headerNominalDiameter`, to scale against the vessel; a header
      with no sheet stays a dashed mark, labelled "not sized".
    * What a drawing CONVENTION fixes and the engine does not publish (which end
      feeds, where a header runs above the rack, that a vessel sits at the centre
      of its pitch cell) is printed in the notes beside the picture, with the
      word `convention`, and carries no dimension.
\*---------------------------------------------------------------------------*/

import {
  INK, STEEL, METAL, GHOST, WARM, COOL, PROVENANCE_INK, esc, marked, text,
  type Provenance,
} from "./equipmentSchematic.js";
import {
  HEADER_ROLES, vesselsInRack, type BankHeaders, type BankRead, type HeaderRole,
} from "./membraneBank.js";
import type { LayoutItem } from "../adapters/SolverAdapter.js";
import type { BuildingRoom, GmpBuilding } from "../adapters/buildingPayload.js";

/** Who chose each number of a bank's sheet.  THIS IS A FACT ABOUT THE SIZER
 *  (MembraneBankSize.cpp reads these from the case's `designRules` and
 *  computes the rest), not a number: the sheet carries no per-key provenance
 *  today, so the drawing reads it here and a later sheet that states it
 *  replaces this table (a key for the engine, said in the report). */
export const BANK_KEY_WHO: { readonly [key: string]: Provenance } = {
  vesselOutsideDiameter: "declared", vesselEndAllowance: "declared",
  vesselsPerRack: "declared", tiers: "declared", pitch: "declared", tierPitch: "declared",
  baseHeight: "declared", endMargin: "declared", rackAisle: "declared",
  elementLength: "record",
  vesselLength: "choupo", vesselsPerTier: "choupo", racks: "choupo", vesselsLastRack: "choupo",
  rackLength: "choupo", rackWidth: "choupo", rackHeight: "choupo", loadingClearance: "choupo",
  envelopeLength: "choupo", envelopeWidth: "choupo", envelopeHeight: "choupo", vessels: "choupo",
};

/** What a drawing returns: the SVG, the notes that belong BESIDE it (an SVG
 *  has no reflow), and the dimension lines it drew (for the reader and the
 *  tests). */
export interface Drawing {
  svg: string;
  notes: { text: string; who: Provenance | null }[];
  dims: { id: string; who: Provenance; label: string }[];
}

const F = (v: number, d = 3): string => String(Number(v.toPrecision(d)));

/** A dimension line with its provenance in two channels.  `kind` "h" runs
 *  along x from (x1,y) to (x2,y), "v" along y from (x,y1) to (x,y2).  The
 *  label is drawn on the side `dir` (1 or -1) of the line. */
function dimLine(into: Drawing["dims"], id: string, kind: "h" | "v", a: number, b: number, at: number,
                 label: string, who: Provenance, dir = 1, anchor: "middle" | "start" = "middle"): string {
  const ink = PROVENANCE_INK[who];
  const s = marked(label, who);
  into.push({ id, who, label: s });
  const tick = 4;
  if (kind === "h") {
    return `<g data-dim="${id}" data-who="${who}" stroke="${ink}" fill="none" stroke-width="1">`
      + `<line x1="${a}" y1="${at}" x2="${b}" y2="${at}"/>`
      + `<line x1="${a}" y1="${at - tick}" x2="${a}" y2="${at + tick}"/>`
      + `<line x1="${b}" y1="${at - tick}" x2="${b}" y2="${at + tick}"/>`
      + text(anchor === "start" ? a : (a + b) / 2, at - 4 * dir, s, ink, 9.5, anchor, ' stroke="none"')
      + `</g>`;
  }
  return `<g data-dim="${id}" data-who="${who}" stroke="${ink}" fill="none" stroke-width="1">`
    + `<line x1="${at}" y1="${a}" x2="${at}" y2="${b}"/>`
    + `<line x1="${at - tick}" y1="${a}" x2="${at + tick}" y2="${a}"/>`
    + `<line x1="${at - tick}" y1="${b}" x2="${at + tick}" y2="${b}"/>`
    + `<text x="${at + 6 * dir}" y="${(a + b) / 2}" fill="${ink}" font-size="9.5" `
    + `font-family="sans-serif" text-anchor="${dir > 0 ? "start" : "end"}" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(s)}</text>`
    + `</g>`;
}

/** A LABELLED BOX for a drawing that cannot be made: the title and the keys
 *  the sheet lacks, never a guess. */
/** A DIMENSION whose line sits at the circle it measures and whose words sit
 *  in the legend band (the headers are too close for inline labels): a short
 *  vertical dimension line at the circle (its role tells which) and the label, with its word, in the band. */
function bandDim(into: Drawing["dims"], id: string, a: number, b: number, atX: number,
                 tx: number, ty: number, label: string, who: Provenance): string {
  const ink = PROVENANCE_INK[who];
  const s = marked(label, who);
  into.push({ id, who, label: s });
  return `<g data-dim="${id}" data-who="${who}" stroke="${ink}" fill="none" stroke-width="1">`
    + `<line x1="${atX}" y1="${a}" x2="${atX}" y2="${b}"/>`
    + `<line x1="${atX - 3}" y1="${a}" x2="${atX + 3}" y2="${a}"/>`
    + `<line x1="${atX - 3}" y1="${b}" x2="${atX + 3}" y2="${b}"/>`
    + text(tx, ty, s, ink, 9.5, "start", ' stroke="none"')
    + `</g>`;
}

export function missingSvg(title: string, missing: readonly string[]): Drawing {
  const W = 520, H = 120;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" `
    + `aria-label="${esc(title)}: not drawn"><rect x="20" y="20" width="${W - 40}" height="${H - 40}" `
    + `rx="6" fill="${STEEL}" stroke="${INK}" stroke-width="1.4" data-missing="true"/>`
    + text(W / 2, 52, `${title}: not drawn`, INK, 13, "middle")
    + text(W / 2, 74, `the sheet lacks: ${missing.join(", ")}`, "#556", 10.5, "middle")
    + `</svg>`;
  return { svg, notes: [{ text: `${title} is not drawn: no number is guessed; the sheet must `
    + `carry ${missing.join(", ")}.`, who: null }], dims: [] };
}

/** A label that stays legible over hatching and neighbours: a white halo. */
const HALO = ' stroke="#fff" stroke-width="2.5" paint-order="stroke"';

const svgOpen = (W: number, H: number, label: string): string =>
  `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${esc(label)}">`;

/** "N x M" style label of a count with its provenance. */
const count = (n: number, what: string): string => `${n} ${what}${n === 1 ? "" : "s"}`;

/** The note a rack drawing carries about its headers, by what was found: the
 *  `pipeHeader` sheets size them (DEV.md 4c C199, the header sizer); a header
 *  whose sheet is absent is a dashed mark with NO diameter, said so. */
const HEADER_FALLBACK_NOTE: Drawing["notes"][number] = {
  text: "A header drawn dashed is NOT SIZED: the run carries no `pipeHeader` sheet for it (the case declares no "
    + "header sizing for this bank), so it is a plain labelled mark with no diameter.",
  who: null };

const ROLE_INK: { [R in HeaderRole]: string } = { feed: COOL, brine: WARM, permeate: "#3a9a6a" };

/*  ======================================================================  */
/*  The SECTION through a rack bay                                          */
/*  ======================================================================  */

/** The room a bank stands in, for the section's roof: its height above the
 *  bank's own base (room floor + room height - the item's base), all from the
 *  declared building. */
export interface RoofInput { name: string; roofAboveBase: number }

/** The SECTION through a rack bay: looking along the vessels, one rack with
 *  the half-aisle each side, the floor, the base frame, every vessel of every
 *  tier as a circle of the published outside diameter, and the roof when the
 *  hall's room height is known. */
export function rackSectionSvg(read: BankRead, rackIndex = 0, roof?: RoofInput): Drawing {
  if (!read.ok) return missingSvg("Section through a rack bay", read.missing);
  const b = read.bank;
  const r = Math.min(Math.max(0, rackIndex), b.racks - 1);
  const n = vesselsInRack(b, r);
  const W = 900;
  const pad = b.rackAisle > 0 ? b.rackAisle / 2 : 0.1 * b.rackWidth;
  const widthM = b.rackWidth + 2 * pad;
  //  THE ROOF IS DRAWN BROKEN when the hall is much taller than the rack: the
  //  rack keeps its own scale (the picture is about the rack) and the headroom
  //  dimension states the TRUE height, marked as not to scale.
  const trueHeadroom = roof ? Math.max(0, roof.roofAboveBase - b.rackHeight) : 0;
  const drawnHeadroom = Math.min(trueHeadroom, 1.2 * b.rackHeight);
  const broken = roof !== undefined && trueHeadroom > drawnHeadroom + 1e-9;
  const heightM = roof ? b.rackHeight + drawnHeadroom : 1.6 * b.rackHeight;
  const zRoof = b.rackHeight + drawnHeadroom;
  const s = Math.min(560 / widthM, 330 / heightM);
  const ox = 300, floor = 40 + heightM * s + 30, H = floor + 70;
  const X = (y: number): number => ox + (y + pad) * s;
  const Z = (z: number): number => floor - z * s;
  const dims: Drawing["dims"] = [];
  const p: string[] = [];

  //  floor, and the roof of the room it stands in
  p.push(`<line x1="40" y1="${floor}" x2="${W - 40}" y2="${floor}" stroke="${INK}" stroke-width="2"/>`);
  p.push(text(46, floor + 14, "floor", GHOST, 9.5, "start"));
  if (roof) {
    p.push(`<line x1="40" y1="${Z(zRoof)}" x2="${W - 40}" y2="${Z(zRoof)}" `
      + `stroke="${INK}" stroke-width="2" stroke-dasharray="10 4"/>`);
    p.push(text(46, Z(zRoof) - 5, `roof of ${roof.name}${broken ? " (drawn broken: headroom not to scale)" : ""}`, GHOST, 9.5, "start"));
  }
  //  the base frame and the corner posts (the frame is a drawing convention)
  p.push(`<rect x="${X(0)}" y="${Z(b.baseHeight)}" width="${b.rackWidth * s}" height="${b.baseHeight * s}" `
    + `fill="${METAL}" stroke="${INK}" stroke-width="1.2"/>`);
  for (const yy of [0, b.rackWidth])
    p.push(`<line x1="${X(yy)}" y1="${Z(b.baseHeight)}" x2="${X(yy)}" y2="${Z(b.rackHeight)}" `
      + `stroke="${METAL}" stroke-width="2.5"/>`);
  //  every vessel of this rack, tier by tier, bottom first
  for (let i = 0; i < n; i++) {
    const tier = Math.floor(i / b.vesselsPerTier), col = i % b.vesselsPerTier;
    const cy = b.baseHeight + (tier + 0.5) * b.tierPitch, cx = (col + 0.5) * b.pitch;
    p.push(`<circle data-vessel="1" cx="${X(cx)}" cy="${Z(cy)}" r="${(b.vesselOutsideDiameter / 2) * s}" `
      + `fill="${STEEL}" stroke="${INK}" stroke-width="1"/>`);
  }
  //  dimension lines, each in its provenance's ink and word
  const topY = Z(b.rackHeight) - 14;
  p.push(dimLine(dims, "vesselOutsideDiameter", "h",
    X(0.5 * b.pitch - b.vesselOutsideDiameter / 2), X(0.5 * b.pitch + b.vesselOutsideDiameter / 2),
    topY - 0, `vessel OD ${F(b.vesselOutsideDiameter)} m`, BANK_KEY_WHO["vesselOutsideDiameter"]!, 1));
  if (b.vesselsPerTier > 1)
    p.push(dimLine(dims, "pitch", "h", X(0.5 * b.pitch), X(1.5 * b.pitch),
      topY - 28, `pitch ${F(b.pitch)} m`, BANK_KEY_WHO["pitch"]!, 1));
  p.push(dimLine(dims, "rackWidth", "h", X(0), X(b.rackWidth), floor + 28,
    `rack width ${F(b.rackWidth)} m = ${b.vesselsPerTier} x pitch`, BANK_KEY_WHO["rackWidth"]!, 1));
  p.push(dimLine(dims, "baseHeight", "v", Z(0), Z(b.baseHeight), X(-pad) + 6,
    `base ${F(b.baseHeight)} m`, BANK_KEY_WHO["baseHeight"]!, -1));
  if (b.tiers > 1)
    p.push(dimLine(dims, "tierPitch", "v", Z(b.baseHeight + 0.5 * b.tierPitch),
      Z(b.baseHeight + 1.5 * b.tierPitch), X(b.rackWidth) + 14,
      `tier pitch ${F(b.tierPitch)} m`, BANK_KEY_WHO["tierPitch"]!, 1));
  p.push(dimLine(dims, "rackHeight", "v", Z(0), Z(b.rackHeight), X(-pad) - 34,
    `rack ${F(b.rackHeight)} m = base + ${b.tiers} x tier pitch`, BANK_KEY_WHO["rackHeight"]!, -1));
  if (roof)
    p.push(dimLine(dims, "headroom", "v", Z(zRoof), Z(b.rackHeight), X(b.rackWidth) + 14,
      `headroom ${F(trueHeadroom)} m to the roof${broken ? " (not to scale)" : ""}`, "choupo", 1));
  if (b.racks > 1 && b.rackAisle > 0)
    p.push(dimLine(dims, "rackAisle", "h", X(b.rackWidth), X(b.rackWidth + pad), floor + 52,
      `half the ${F(b.rackAisle)} m aisle`, BANK_KEY_WHO["rackAisle"]!, 1));

  const notes: Drawing["notes"] = [
    { text: `Section through rack ${r + 1} of ${b.racks}, looking along the vessels: ${count(n, "vessel")}, `
        + `${b.tiers} tiers of up to ${b.vesselsPerTier}.`, who: "choupo" },
    { text: "convention: each vessel is centred in its pitch cell and a rack fills bottom tier first; "
        + "the frame (base, posts) is drawn, not sized.", who: null },
    roof
      ? { text: `The roof is the declared room height of ${roof.name} (the headroom is computed from it).`,
          who: "declared" }
      : { text: "The roof is not drawn: no room of a declared building holds this bank, so its height "
          + "is not published.", who: null },
  ];
  return { svg: svgOpen(W, H, "section through a rack bay") + p.join("") + "</svg>", notes, dims };
}

/*  ======================================================================  */
/*  The ELEVATION of one rack, with its three headers                       */
/*  ======================================================================  */

/** The side elevation of ONE rack (looking across it) with the feed and
 *  brine headers above the vessels, the permeate header at the low-x end, and
 *  the connection of every tier to them; below it the same rack seen from
 *  above with every vessel of its top tier on the three headers. */
export function rackElevationSvg(read: BankRead, rackIndex = 0, headers: BankHeaders = {}): Drawing {
  if (!read.ok) return missingSvg("Elevation of a rack", read.missing);
  const b = read.bank;
  const r = Math.min(Math.max(0, rackIndex), b.racks - 1);
  const n = vesselsInRack(b, r);
  const nTiers = Math.ceil(n / b.vesselsPerTier);
  const W = 900;
  //  the horizontal extent: permeate header, the rack, the loading clearance
  //  every header's bore from ITS OWN sheet (the bank sheet's key is the legacy single bore)
  const boreOf = (role: HeaderRole): number | undefined => headers[role]?.diameter ?? b.headerNominalDiameter;
  const maxBore = Math.max(0, ...HEADER_ROLES.map((q) => boreOf(q) ?? 0));
  const left = 190, hdrAbove = Math.max(1.1 * b.vesselOutsideDiameter + 0.3, maxBore + 0.5);   // drawing room, not a dimension
  const spanM = b.rackLength + b.loadingClearance;
  const s = Math.min((W - left - 40) / spanM, 80);
  const ox = left;
  const X = (x: number): number => ox + x * s;
  const dims: Drawing["dims"] = [];
  const p: string[] = [];

  //  ---- panel 1: the side elevation --------------------------------------
  const topM = b.rackHeight + hdrAbove;
  const BAND = 54;                                   // the header legend band above the elevation
  const floor1 = 50 + BAND + topM * s + 8;
  const Z = (z: number): number => floor1 - z * s;
  p.push(text(ox, 22, `Elevation of rack ${r + 1} of ${b.racks} (looking across the rack)`, INK, 12, "start"));
  p.push(text(W - 330, 22, "feed", COOL, 11, "start"), text(W - 270, 22, "brine", WARM, 11, "start"),
    text(W - 210, 22, "permeate", "#3a9a6a", 11, "start"));
  p.push(`<line x1="30" y1="${floor1}" x2="${W - 30}" y2="${floor1}" stroke="${INK}" stroke-width="2"/>`);
  p.push(`<rect x="${X(0)}" y="${Z(b.baseHeight)}" width="${b.rackLength * s}" height="${b.baseHeight * s}" `
    + `fill="${METAL}" stroke="${INK}" stroke-width="1.2"/>`);
  const feedX = b.endMargin + 0.6 * b.vesselOutsideDiameter;                 // convention: radial ports near the ends
  const brineX = b.rackLength - feedX;
  const permX = -2.6 * b.vesselOutsideDiameter;                               // convention: axial permeate at the low-x end
  const hz = b.rackHeight + 0.5 * hdrAbove;                                   // convention: header axes above the rack
  //  the TRUE radius in pixels at the vessels' own scale; a header with no sheet is a plain mark
  const rOf = (role: HeaderRole): number => { const d = boreOf(role); return d ? (d / 2) * s : 0.35 * b.vesselOutsideDiameter * s; };
  const strokeOf = (role: HeaderRole): string => boreOf(role) ? `fill="#f2f5f8"` : `fill="none" stroke-dasharray="3 2"`;
  for (let t = 0; t < nTiers; t++) {
    const vz = b.baseHeight + (t + 0.5) * b.tierPitch;
    const inTier = Math.min(b.vesselsPerTier, n - t * b.vesselsPerTier);
    p.push(`<rect data-tier="${t}" x="${X(b.endMargin)}" y="${Z(vz + b.vesselOutsideDiameter / 2)}" `
      + `width="${b.vesselLength * s}" height="${b.vesselOutsideDiameter * s}" rx="${b.vesselOutsideDiameter * s / 2}" `
      + `fill="${STEEL}" stroke="${INK}" stroke-width="1.2"/>`);
    p.push(text(X(b.endMargin + b.vesselLength / 2), Z(vz) + 3, `${inTier} vessels in this tier`, "#456", 9, "middle"));
    //  branches: feed and brine up to their headers, permeate out of the end cap
    const vTop = vz + b.vesselOutsideDiameter / 2;
    p.push(`<line data-branch="feed" x1="${X(feedX)}" y1="${Z(vTop)}" x2="${X(feedX)}" y2="${Z(hz)}" stroke="${COOL}" stroke-width="1.6"/>`);
    p.push(`<line data-branch="brine" x1="${X(brineX)}" y1="${Z(vTop)}" x2="${X(brineX)}" y2="${Z(hz)}" stroke="${WARM}" stroke-width="1.6"/>`);
    p.push(`<line data-branch="permeate" x1="${X(b.endMargin)}" y1="${Z(vz)}" x2="${X(permX)}" y2="${Z(vz)}" stroke="#3a9a6a" stroke-width="1.6"/>`);
  }
  p.push(`<line x1="${X(permX)}" y1="${Z(b.baseHeight / 2 + 0.2 * b.rackHeight)}" x2="${X(permX)}" y2="${Z(b.rackHeight)}" stroke="#3a9a6a" stroke-width="3"/>`);
  p.push(`<line x1="${X(permX)}" y1="${Z(hz)}" x2="${X(permX)}" y2="${Z(b.rackHeight)}" stroke="#3a9a6a" stroke-width="2"/>`);
  for (const [x, role] of [[feedX, "feed"], [brineX, "brine"], [permX, "permeate"]] as const) {
    const ink = ROLE_INK[role], h = headers[role], r = rOf(role), cx = X(x), cy = Z(hz);
    const sized = boreOf(role) !== undefined;
    p.push(`<circle data-header="${role}" data-sized="${sized ? 1 : 0}"${sized ? ` data-diameter="${boreOf(role)}"` : ""} `
      + `cx="${cx}" cy="${cy}" r="${r}" ${strokeOf(role)} stroke="${ink}" stroke-width="2"/>`);
    //  the headers sit close together, so their words go in the legend band; the circle carries its role
    if (role === "permeate") p.push(text(cx - r - 6, cy + 3, sized ? "permeate" : "permeate (not sized)", ink, 10, "end"));
    else p.push(text(cx, cy - r - 4, sized ? role : `${role} (not sized)`, ink, 10, "middle"));
    if (h) {
      //  the computed requirement: the smallest bore under the window's top, a dashed ring inside the picked bore
      p.push(`<circle data-required="${role}" cx="${cx}" cy="${cy}" r="${(h.required / 2) * s}" fill="none" `
        + `stroke="${PROVENANCE_INK.choupo}" stroke-dasharray="2 2" stroke-width="1"/>`);
      //  the legend band: one column per header, each line a dimension of its circle (the rule, in two channels)
      const colX = 30 + HEADER_ROLES.indexOf(role) * 290;
      p.push(text(colX, 44, `${role} header, ${F(h.flow)} m3/h per train`, ink, 10.5, "start", ' font-weight="600"'));
      p.push(bandDim(dims, `header.${role}.nominal`, cy - r, cy + r, cx + r + 6, colX, 57,
        `${role} nominal bore ${F(h.diameter)} m`, "declared"));
      p.push(bandDim(dims, `header.${role}.required`, cy - (h.required / 2) * s, cy + (h.required / 2) * s, cx - r - 6, colX, 69,
        `${role} required bore ${F(h.required)} m, computed`, "choupo"));
      p.push(text(colX, 81, `v ${F(h.velocity)} m/s, ${F(h.pressureDropPerMetre)} Pa/m`, "#456", 9.5, "start"));
    }
  }
  //  loading clearance, hatched, free at the high-x end
  if (b.loadingClearance > 0)
    p.push(`<rect data-clearance="1" x="${X(b.rackLength)}" y="${Z(b.rackHeight)}" width="${b.loadingClearance * s}" `
      + `height="${b.rackHeight * s}" fill="url(#hatch)" stroke="${GHOST}" stroke-dasharray="4 3"/>`);
  //  dimension lines
  const yDim = floor1 + 20;
  p.push(dimLine(dims, "vesselLength", "h", X(b.endMargin), X(b.endMargin + b.vesselLength), yDim,
    `vessel ${F(b.vesselLength)} m = ${b.elementsPerVessel} x ${F(b.elementLength)} m element + end allowance`,
    BANK_KEY_WHO["vesselLength"]!, 1));
  p.push(dimLine(dims, "endMargin", "h", X(0), X(b.endMargin), yDim + 22,
    `end margin ${F(b.endMargin)} m`, BANK_KEY_WHO["endMargin"]!, 1));
  p.push(dimLine(dims, "rackLength", "h", X(0), X(b.rackLength), yDim + 44,
    `rack ${F(b.rackLength)} m`, BANK_KEY_WHO["rackLength"]!, 1));
  if (b.loadingClearance > 0)
    p.push(dimLine(dims, "loadingClearance", "h", X(b.rackLength), X(b.envelopeLength), yDim + 44,
      `loading clearance ${F(b.loadingClearance)} m (free)`, BANK_KEY_WHO["loadingClearance"]!, 1));
  p.push(dimLine(dims, "baseHeight", "v", Z(0), Z(b.baseHeight), X(b.rackLength) + 10,
    `base ${F(b.baseHeight)} m`, BANK_KEY_WHO["baseHeight"]!, 1));

  //  ---- panel 2: the same rack seen from above --------------------------
  const top2 = floor1 + 130;
  const sy = s;                                   // same scale as the elevation
  const Y = (y: number): number => top2 + 24 + (b.rackWidth - y) * sy;
  p.push(text(ox, top2 + 6, `The same rack from above: the ${n - (nTiers - 1) * b.vesselsPerTier} vessels of its top tier `
    + `(each lower tier connects the same way)`, INK, 12, "start"));
  p.push(`<rect x="${X(0)}" y="${Y(b.rackWidth)}" width="${b.rackLength * s}" height="${b.rackWidth * sy}" `
    + `fill="none" stroke="${METAL}" stroke-width="1.2"/>`);
  const topTier = n - (nTiers - 1) * b.vesselsPerTier;      // the vessels the top present tier holds
  for (let c = 0; c < topTier; c++) {
    const yc = (c + 0.5) * b.pitch;
    p.push(`<rect data-vessel-top="1" x="${X(b.endMargin)}" y="${Y(yc + b.vesselOutsideDiameter / 2)}" `
      + `width="${b.vesselLength * s}" height="${b.vesselOutsideDiameter * sy}" rx="${b.vesselOutsideDiameter * sy / 2}" `
      + `fill="${STEEL}" stroke="${INK}" stroke-width="1"/>`);
    p.push(`<line data-branch="permeate" x1="${X(b.endMargin)}" y1="${Y(yc)}" x2="${X(permX)}" y2="${Y(yc)}" stroke="#3a9a6a" stroke-width="1.2"/>`);
    p.push(`<circle cx="${X(feedX)}" cy="${Y(yc)}" r="2.6" fill="${COOL}"/>`);
    p.push(`<circle cx="${X(brineX)}" cy="${Y(yc)}" r="2.6" fill="${WARM}"/>`);
  }
  const yTop = Y(b.rackWidth) - 6, yBot = Y(0) + 6;
  p.push(`<line x1="${X(feedX)}" y1="${yTop}" x2="${X(feedX)}" y2="${yBot}" stroke="${COOL}" stroke-width="${Math.max(1.6, 2 * rOf("feed"))}" ${boreOf("feed") ? 'stroke-opacity="0.5"' : 'stroke-dasharray="3 2"'}/>`);
  p.push(`<line x1="${X(brineX)}" y1="${yTop}" x2="${X(brineX)}" y2="${yBot}" stroke="${WARM}" stroke-width="${Math.max(1.6, 2 * rOf("brine"))}" ${boreOf("brine") ? 'stroke-opacity="0.5"' : 'stroke-dasharray="3 2"'}/>`);
  p.push(`<line x1="${X(permX)}" y1="${yTop}" x2="${X(permX)}" y2="${yBot}" stroke="#3a9a6a" stroke-width="${Math.max(1.6, 2 * rOf("permeate"))}" ${boreOf("permeate") ? 'stroke-opacity="0.5"' : 'stroke-dasharray="3 2"'}/>`);
  if (b.loadingClearance > 0)
    p.push(`<rect x="${X(b.rackLength)}" y="${Y(b.rackWidth)}" width="${b.loadingClearance * s}" height="${b.rackWidth * sy}" `
      + `fill="url(#hatch)" stroke="${GHOST}" stroke-dasharray="4 3"/>`);
  p.push(dimLine(dims, "pitch", "v", Y(0.5 * b.pitch), Y(1.5 * b.pitch), X(b.rackLength) + 8,
    `pitch ${F(b.pitch)} m`, BANK_KEY_WHO["pitch"]!, 1));
  p.push(dimLine(dims, "rackWidth", "v", Y(0), Y(b.rackWidth), X(permX) - 14,
    `rack width ${F(b.rackWidth)} m`, BANK_KEY_WHO["rackWidth"]!, -1));
  const H = Y(0) + 40;

  const defs = `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" `
    + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="${GHOST}" stroke-width="1.2"/></pattern></defs>`;
  const notes: Drawing["notes"] = [
    { text: `${count(n, "vessel")} in this rack: ${nTiers} tier${nTiers === 1 ? "" : "s"} of up to ${b.vesselsPerTier}; `
      + `each vessel connects to the feed and brine headers (blue, red dots) and to the permeate header (green).`, who: "choupo" },
    { text: "convention: feed and brine are radial ports near the vessel ends, branching up to headers above the "
      + "rack; permeate leaves each end cap at the low-x end; the sheet publishes no port positions. "
      + "The loading clearance (hatched) stays free at the high-x end, as the engine's envelope has it.", who: null },
    ...HEADER_ROLES.flatMap((role): Drawing["notes"] => {
      const h = headers[role];
      if (!h) return [];
      return [{ text: `${role} header: nominal bore ${F(h.diameter)} m (the smallest declared bore that fits; required `
        + `${F(h.required)} m), ${F(h.flow)} m3/h per train at ${F(h.velocity)} m/s, ${F(h.pressureDropPerMetre)} Pa/m. `
        + `Drawn to scale against the vessels (outside diameter ${F(b.vesselOutsideDiameter)} m).`, who: "choupo" }];
    }),
    ...(HEADER_ROLES.some((q) => boreOf(q) === undefined) ? [HEADER_FALLBACK_NOTE] : []),
  ];
  return { svg: svgOpen(W, H, "elevation of one rack with its headers") + defs + p.join("") + "</svg>", notes, dims };
}

/*  ======================================================================  */
/*  The PLAN of the hall                                                    */
/*  ======================================================================  */

/** What the plan draws: the layout's items, the declared building, and the
 *  banks read from their sheets by item id. */
export interface HallPlanInput {
  items: readonly LayoutItem[];
  building?: GmpBuilding;
  banks: ReadonlyMap<string, BankRead>;
}

/** The room of a building that lists an item. */
export function roomOf(building: GmpBuilding | undefined, itemId: string): BuildingRoom | undefined {
  return building?.rooms.find((r) => r.equipment.includes(itemId));
}

/** The PLAN of the hall: the rooms, the racks of every bank (their loading
 *  clearances hatched), the pumps and exchanger arrays as the boxes the case
 *  declared, and the cut line of the section. */
export function hallPlanSvg(input: HallPlanInput): Drawing | null {
  const { items, building, banks } = input;
  const inRoom = new Set((building?.rooms ?? []).flatMap((r) => r.equipment));
  const shown = items.filter((it) => inRoom.has(it.id) || it.kind === "membraneBank");
  if (shown.length === 0) return null;

  //  extent: the rooms where there are some, else the items
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (a: number, b: number, c: number, d: number) => {
    x0 = Math.min(x0, a); x1 = Math.max(x1, b); y0 = Math.min(y0, c); y1 = Math.max(y1, d);
  };
  for (const r of building?.rooms ?? []) grow(r.xMin, r.xMax, r.yMin, r.yMax);
  for (const it of shown) grow(it.x - it.dx / 2, it.x + it.dx / 2, it.y - it.dy / 2, it.y + it.dy / 2);
  const W = 900, mx = 120, top = 50;
  const s = (W - 2 * mx) / (x1 - x0);
  const Wm = x1 - x0, Hm = y1 - y0;
  const H = top + Hm * s + 90;
  const X = (x: number): number => mx + (x - x0) * s;
  const Y = (y: number): number => top + (y1 - y) * s;
  const dims: Drawing["dims"] = [];
  const p: string[] = [];

  p.push(`<defs><pattern id="hatchPlan" width="6" height="6" patternUnits="userSpaceOnUse" `
    + `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${GHOST}" stroke-width="1"/></pattern></defs>`);
  p.push(text(mx, 24, "Plan of the reverse-osmosis hall", INK, 13, "start"));
  //  rooms
  for (const r of building?.rooms ?? []) {
    p.push(`<rect data-room="${esc(r.name)}" x="${X(r.xMin)}" y="${Y(r.yMax)}" width="${(r.xMax - r.xMin) * s}" `
      + `height="${(r.yMax - r.yMin) * s}" fill="none" stroke="${METAL}" stroke-width="1.4" stroke-dasharray="7 3"/>`);
    p.push(text(X(r.xMin) + 4, Y(r.yMax) + 11, `${r.name}`, "#556", 9.5, "start", HALO));
  }
  //  items
  let cut: { x: number; ya: number; yb: number } | null = null;
  for (const it of shown) {
    const bx = it.x - it.dx / 2, by = it.y - it.dy / 2;
    const read = banks.get(it.id);
    if (it.kind === "membraneBank" && read && read.ok) {
      const b = read.bank;
      for (let r = 0; r < b.racks; r++) {
        const yy0 = by + r * (b.rackWidth + b.rackAisle);
        p.push(`<rect data-rack="${esc(it.id)}#${r}" x="${X(bx)}" y="${Y(yy0 + b.rackWidth)}" width="${b.rackLength * s}" `
          + `height="${b.rackWidth * s}" fill="${STEEL}" stroke="${INK}" stroke-width="0.8"/>`);
      }
      if (b.loadingClearance > 0)
        p.push(`<rect data-clearance="${esc(it.id)}" x="${X(bx + b.rackLength)}" y="${Y(by + b.envelopeWidth)}" `
          + `width="${b.loadingClearance * s}" height="${b.envelopeWidth * s}" fill="url(#hatchPlan)" `
          + `stroke="${GHOST}" stroke-dasharray="3 2" stroke-width="0.8"/>`);
      p.push(text(X(bx) + 2, Y(by + b.envelopeWidth) - 2, it.id, INK, 8, "start", HALO));
      if (!cut) cut = { x: bx + b.rackLength / 2, ya: by - 1, yb: by + b.envelopeWidth + 1 };
    } else {
      const label = it.kind === "membraneBank" ? `${it.id} (bank not read)` : it.id;
      p.push(`<rect data-item="${esc(it.id)}" x="${X(bx)}" y="${Y(it.y + it.dy / 2)}" width="${it.dx * s}" `
        + `height="${it.dy * s}" fill="${it.kind === "membraneBank" ? "#fff" : "#e2e7ec"}" `
        + `stroke="${INK}" stroke-width="0.8"${it.kind === "membraneBank" ? ' stroke-dasharray="3 2"' : ""}/>`);
      if (it.dx * s > 26) p.push(text(X(bx) + 2, Y(it.y + it.dy / 2) + 9, label, "#445", 7.5, "start", HALO));
    }
  }
  //  the section's cut line
  if (cut)
    p.push(`<g data-cut="A"><line x1="${X(cut.x)}" y1="${Y(cut.ya)}" x2="${X(cut.x)}" y2="${Y(cut.yb)}" `
      + `stroke="${WARM}" stroke-width="1.4" stroke-dasharray="8 3 2 3"/>`
      + text(X(cut.x) + 3, Y(cut.yb) - 3, "A", WARM, 11, "start")
      + text(X(cut.x) + 3, Y(cut.ya) + 11, "A", WARM, 11, "start") + `</g>`);
  //  overall dimensions: the declared rooms
  if (building && building.rooms.length > 0) {
    p.push(dimLine(dims, "hallLength", "h", X(x0), X(x1), top + Hm * s + 28,
      `${F(Wm, 4)} m, the declared rooms' extent`, "declared", 1));
    p.push(dimLine(dims, "hallWidth", "v", Y(y1), Y(y0), X(x0) - 12,
      `${F(Hm, 4)} m`, "declared", -1));
  }
  const firstItem = items.find((it) => { const r = banks.get(it.id); return r !== undefined && r.ok; });
  const firstRead = firstItem ? banks.get(firstItem.id) : undefined;
  const firstBank = firstRead && firstRead.ok ? firstRead : undefined;
  if (firstBank && firstItem)
    p.push(dimLine(dims, "bankLength", "h", X(firstItem.x - firstItem.dx / 2),
      X(firstItem.x - firstItem.dx / 2 + firstBank.bank.envelopeLength), top + Hm * s + 58,
      `one bank: ${F(firstBank.bank.envelopeLength)} m = rack ${F(firstBank.bank.rackLength)} m + loading clearance `
      + `${F(firstBank.bank.loadingClearance)} m (hatched)`, "choupo", 1, "start"));
  const nBanks = [...banks.values()].filter((r) => r.ok).length;
  const notes: Drawing["notes"] = [
    { text: `${nBanks} vessel bank${nBanks === 1 ? "" : "s"} drawn from their sheets: racks as rectangles, the loading clearance `
      + "hatched at the high-x end of each; the section A-A is cut through the first bank.", who: "choupo" },
    { text: "The rooms and the boxes of the pumps and exchanger arrays are the CASE's declared places and footprints "
      + "(the engine publishes no size for those two kinds); the racks are the engine's published geometry.", who: "declared" },
    { text: "Indoor piping is not routed by the engine, so the plan draws none.", who: null },
  ];
  return { svg: svgOpen(W, H, "plan of the reverse-osmosis hall") + p.join("") + "</svg>", notes, dims };
}
