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
  equipmentSchematic -- THE DRAWING IS DISPATCHED ON THE EQUIPMENT KIND, and a
  kind with no drawing gets a LABELLED BOX rather than somebody else's picture.

  `SizingPass` writes one specification sheet per physical item and stamps each
  with its own `equipment` word -- the same registered-type word the sizers are
  keyed on.  This module is the ONE place that turns that word into a picture,
  so adding a kind touches no reader: register a builder here and every page
  that draws a sheet gains it.

  A LABELLED BOX BEATS A WRONG PICTURE.  There is no generic "vessel-ish"
  drawing that is nearly right for a crystalliser, a cyclone and a compressor;
  approximating one kind's geometry with another's puts a claim on the page
  that no number behind it supports.  So the fallback is a box with the
  equipment word, the item name and the unit's ports on it, and it SAYS that no
  schematic exists for that kind.

  WHAT THE DRAWING MAY USE.  Only what the run PUBLISHED: the sheet's own
  `sizing {}` values with the units the sizer declared, the sheet's ports, and
  the unit's KPIs.  Nothing here computes a design number -- that is the
  2026-09-05 rule (the engine publishes the first law, the GUI draws it, and
  when it is absent the GUI says so and computes nothing in its place).  A
  dimension the sheet does not carry is a dimension the drawing does not show.

  AND A NUMBER THE CASE DECLARED MUST NOT LOOK LIKE A NUMBER CHOUPO COMPUTED.
  Every dimension on a drawing here carries its provenance in TWO channels at
  once -- the ink colour and the word in brackets -- because colour alone is
  not a label a reader can quote.  `column10_flooding` declares its 1.10 m
  tower and the trays are RATED against it; `column09_tray_hydraulics` declares
  none and the pass DESIGNS 1.3158 m.  Publishing the first as though it were
  the second would be the falsest thing on the page, and the engine already
  answers the question itself: `diameterDesigned` is a KPI, written as a FACT
  rather than something a reader downstream infers by comparing numbers.
\*---------------------------------------------------------------------------*/
import type { DesignPort, DesignSheet, DesignValue } from "./designSheet.js";
import { headersOf, readBank } from "./membraneBank.js";

/*  ---- Provenance: one vocabulary, two channels ------------------------- */

/** Who chose a number on a drawing.  A quantity whose provenance is unknown
 *  does not get drawn.
 *
 *  It used to say "there is no third value", and for the column that is still
 *  true.  A DESIGNED exchanger (2026-10-07, DEV.md 4c C51) put two more on one
 *  page: the FEHE's rated area and U are READ FROM THE UNIT (the flowsheet
 *  converged on them; the design is set beside them, not over them), and the
 *  tube wall's conductivity and a utility's supply/return temperatures are
 *  READ FROM A DATA RECORD (the material, the utility) -- neither chosen by
 *  this case nor computed by this run.  The engine says which, key by key, in
 *  the sheet's `exchanger {}` block; nothing here infers it. */
export type Provenance = "choupo" | "declared" | "unit" | "record";

/** The ink each provenance uses, matching the section headers of the page the
 *  drawing sits on -- green for SIZED BY CHOUPO, grey for DECLARED BY THE
 *  CASE, the rating blue for a number read from the unit, violet for one read
 *  from a record.  The page and the picture must not use two palettes for one
 *  fact. */
export const PROVENANCE_INK: { [P in Provenance]: string } =
  { choupo: "#2f6d4f", declared: "#4a4a4a", unit: "#37536e", record: "#6a4c93" };

/** The word, because colour is not readable aloud, does not survive a
 *  greyscale print, and is not what a reader quotes in a report. */
export const PROVENANCE_WORD: { [P in Provenance]: string } =
  { choupo: "Choupo", declared: "declared", unit: "from the unit",
    record: "from a record" };

/** A label with its provenance stated in words.  Used for every dimension. */
export function marked(text: string, who: Provenance): string {
  return `${text} (${PROVENANCE_WORD[who]})`;
}

/*  ---- Small helpers shared by every builder ---------------------------- */

export const INK = "#2b2b2b", STEEL = "#c2ccd6", METAL = "#8a97a6",
      GHOST = "#9aa7b4", WARM = "#e0785a", COOL = "#4a90d9";

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function text(x: number, y: number, s: string, fill = INK, size = 11,
              anchor: "start" | "middle" | "end" = "start",
              style = ""): string {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" `
    + `font-family="sans-serif" text-anchor="${anchor}"${style}>${esc(s)}</text>`;
}

/** A sizing value by key, or undefined.  Never defaulted: the caller decides
 *  what an absent dimension means for its own drawing, and every one of them
 *  answers by leaving the label off rather than by inventing a number. */
export function sizingValue(sheet: DesignSheet | null | undefined, key: string):
  DesignValue | undefined {
  return sheet?.sizing.find((v) => v.key === key);
}

/** Six significant digits then the sizer's own declared unit -- the same
 *  rendering the tables use, so a number on the picture and the same number in
 *  the table below it are recognisably one number. */
export function fmt(v: DesignValue | undefined, digits = 4): string {
  if (!v) return "—";
  const n = Number(v.value.toPrecision(digits)).toString();
  return v.unit === "-" || v.unit === "" ? n : `${n} ${v.unit}`;
}

/*  ---- The honest fallback ---------------------------------------------- */

/** A LABELLED BOX: the equipment word, the item, and the unit's ports.
 *
 *  It deliberately carries NO dimension and no shape cue -- not a dished head,
 *  not an impeller, not a nozzle drawn at a size.  Everything a reader could
 *  measure off it would be a claim, and the whole point of this drawing is
 *  that Choupo has no picture of this kind yet.  What it does carry is the
 *  ports, which the sheet really does state.
 *
 *  WHY THE BOX SAYS NOTHING ABOUT WHY.  The reason a kind reaches here is
 *  prose -- `noSchematicReason()` -- and prose does not belong in an SVG: it
 *  has no line wrap and no reflow, so a sentence longer than the viewBox is
 *  cut at both ends without a word.  That happened here on the first render.
 *  The caller prints the reason beside the picture, in HTML, where it wraps. */
export function fallbackBoxSvg(sheet: DesignSheet): string {
  const W = 520, H = 150;
  const bx = 150, by = 34, bw = 220, bh = 96;
  const p: string[] = [];
  p.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" `
    + `fill="${STEEL}" stroke="${INK}" stroke-width="1.5"/>`);
  p.push(text(bx + bw / 2, by + bh / 2 - 6, sheet.equipment, INK, 15, "middle"));
  p.push(text(bx + bw / 2, by + bh / 2 + 14,
    sheet.item === "" ? sheet.unit : `${sheet.unit} · ${sheet.item}`,
    "#556", 11, "middle"));

  //  The ports are the UNIT's, as the sheet's own comment says.  Drawn as
  //  plain stubs with the stream name: a stub has no diameter and no rating,
  //  which is exactly what Choupo knows about them.
  const stub = (i: number, n: number, side: "in" | "out", port: DesignPort) => {
    const y = by + (bh * (i + 1)) / (n + 1);
    const x0 = side === "in" ? bx - 46 : bx + bw;
    const x1 = side === "in" ? bx : bx + bw + 46;
    return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${METAL}" `
      + `stroke-width="3"/>`
      + text(side === "in" ? x0 - 4 : x1 + 4, y - 4,
             port.global || port.key, "#556", 10,
             side === "in" ? "end" : "start");
  };
  sheet.inlets.forEach((pt, i) => p.push(stub(i, sheet.inlets.length, "in", pt)));
  sheet.outlets.forEach((pt, i) => p.push(stub(i, sheet.outlets.length, "out", pt)));
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" `
    + `role="img" aria-label="labelled box for ${esc(sheet.equipment)}">`
    + p.join("") + "</svg>";
}

/*  ---- The distillation tower ------------------------------------------- */

export interface ColumnDrawing {
  /** The tower itself.  Required: without it there is no tower to draw. */
  shell: DesignSheet;
  /** The tray stack.  A column sized with zero trays writes no `trays` sheet
   *  and the tower is drawn empty rather than with a guessed internal. */
  trays: DesignSheet | null;
  /** Which of the auxiliaries the run actually sized, by item name.  An item
   *  the case did not ask for is not drawn -- a condenser box on a column with
   *  no `condenser {}` block would be equipment nobody specified. */
  hasCondenser: boolean;
  hasReboiler: boolean;
  hasRefluxDrum: boolean;
  /** The unit's KPIs.  Used ONLY for facts the sheets do not carry: which
   *  stage the feed enters (an ECHO of the case's own `operation.feedStage`,
   *  and labelled as the author's), how close the worst tray runs to flood and
   *  WHICH tray that is, and whether the diameter was designed or rated. */
  kpis: { [k: string]: number };
}

/** What the tower drawing decided, so a caller can put the same facts in its
 *  caption without asking the same questions again. */
export interface ColumnSchematic {
  svg: string;
  /** The dimension notes that belong BESIDE the picture rather than inside it.
   *  They were drawn as SVG text first and the longest one ran off the right
   *  edge of the viewBox and was silently cut in half -- an SVG has no line
   *  wrap and no reflow, so prose in a picture is prose with a hard limit
   *  nobody sees until it is exceeded.  The caller renders these as text. */
  notes: { text: string; who: Provenance | null }[];
  /** True when the shell is drawn at the sheet's own H and D, in one scale.
   *  False when the aspect ratio makes that illegible, and then the caption
   *  says the picture is not to scale -- because a drawing that silently
   *  stops being to scale is a drawing a reader measures. */
  toScale: boolean;
  /** How many trays are drawn as lines.  Below the count on the sheet when the
   *  stack is too dense to draw one line per tray, and the caption says so. */
  traysDrawn: number;
  /** The tray count the sheet published, or 0 when it published none. */
  nTrays: number;
}

/** WHY THIS TOWER IS NEVER DRAWN WITH A SWAGE TRANSITION.
 *
 *  `ColumnSize` sizes the shell STRAIGHT and says so in its own header: a
 *  swaged tower -- two diameters and a transition cone -- is an ECONOMIC
 *  choice, Choupo prices no transition, so it does not take that decision.  It
 *  publishes ONE shell `D`, both SECTION diameters and their gap, and leaves
 *  the comparison to the reader.
 *
 *  So the drawing shows the tower the engine sized -- one diameter, no cone --
 *  and draws the narrower section's requirement as a DASHED outline inside it,
 *  labelled with the gap.  That is the honest reading of a sheet that says
 *  "straight at the wider section": the dashed line is what a section would
 *  have needed, not a wall anybody would build.  If a future sizer ever
 *  publishes a swaged shell, it will publish more than one `D` and this
 *  builder must be taught the new keys -- it will not silently draw a cone
 *  from two SECTION diameters, which are not shell diameters.
 */
export function columnTowerSvg(d: ColumnDrawing): ColumnSchematic {
  const W = 800, HH = 430;
  const p: string[] = [];

  const vD = sizingValue(d.shell, "D");
  const vH = sizingValue(d.shell, "H");
  const vRect = sizingValue(d.shell, "D_rectifying");
  const vStrip = sizingValue(d.shell, "D_stripping");
  const vGap = sizingValue(d.shell, "swageGap");
  const vSpacing = sizingValue(d.shell, "traySpacing")
    ?? sizingValue(d.trays, "traySpacing");
  const nTrays = Math.max(0, Math.round(
    sizingValue(d.shell, "nTrays")?.value ?? sizingValue(d.trays, "nTrays")?.value ?? 0));

  const D = vD?.value ?? 0, H = vH?.value ?? 0;
  //  TO SCALE, OR HONESTLY NOT.  Outside this band the tower is either a
  //  sliver too thin to letter or a box too squat to read as a tower, and a
  //  picture that quietly abandons its scale is one a reader measures anyway.
  const aspect = D > 0 ? H / D : 0;
  const toScale = D > 0 && H > 0 && aspect >= 1.5 && aspect <= 12;

  const cx = 250, top = 58, bot = 372, span = bot - top;   // px
  const pxPerM = toScale ? span / H : 0;
  const wPx = toScale ? D * pxPerM : 74;
  const xL = cx - wPx / 2, xR = cx + wPx / 2;

  //  ---- the shell ----------------------------------------------------
  p.push(`<path d="M${xL} ${top + 14} a${wPx / 2} 14 0 0 1 ${wPx} 0 `
    + `v${span - 28} a${wPx / 2} 14 0 0 1 ${-wPx} 0 z" fill="${STEEL}" `
    + `stroke="${INK}" stroke-width="1.6"/>`);

  //  ---- the trays ----------------------------------------------------
  //  The tray STACK is (nTrays-1) pitches tall and the sheet publishes H and
  //  the pitch but NOT how the leftover height is split between the
  //  disengagement space above and the sump below -- both are sizer
  //  assumptions and only their NAMES reach the sheet.  So the stack is
  //  centred and the caption says the split is not published.  Placing it as
  //  though the split were known would be the drawing inventing a dimension.
  const pitch = toScale && vSpacing ? vSpacing.value * pxPerM
    : (nTrays > 1 ? (span - 60) / (nTrays - 1) : 0);
  const stackPx = nTrays > 1 ? (nTrays - 1) * pitch : 0;
  const y0 = top + (span - stackPx) / 2;
  const trayY = (i: number) => y0 + (i - 1) * pitch;      // 1-based, 1 = top

  //  A stack too dense to letter is drawn as a DASHED BAND with its count,
  //  not as forty lines two pixels apart that read as a solid block.  A
  //  SINGLE tray has no pitch at all and is always drawn: it would otherwise
  //  fall to the band, which at zero height is an invisible rectangle under
  //  the words "1 trays".
  const drawEach = nTrays === 1 || (nTrays > 0 && pitch >= 5);
  const traysDrawn = drawEach ? nTrays : 0;
  if (drawEach) {
    for (let i = 1; i <= nTrays; i++) {
      const y = trayY(i);
      p.push(`<line x1="${xL + 2}" y1="${y}" x2="${xR - 2}" y2="${y}" `
        + `stroke="${METAL}" stroke-width="1.4"/>`);
      //  Weir and downcomer, SCHEMATIC and alternating side, and NO dimension
      //  on either.  The sheet carries none: `ColumnSize` writes D, H, V_R,
      //  nTrays, traySpacing, the wall and the weight, and nothing about a
      //  tray's interior.  The weir height the case declares is a hydraulics
      //  INPUT, so drawing to it would put an author's number on a picture
      //  headed by Choupo's.
      const left = i % 2 === 1;
      const wx = left ? xL + 2 : xR - 2;
      const dx = left ? xL + 7 : xR - 7;
      p.push(`<line x1="${wx}" y1="${y}" x2="${wx}" y2="${y - 5}" `
        + `stroke="${INK}" stroke-width="1.6"/>`);
      if (i < nTrays)
        p.push(`<line x1="${dx}" y1="${y}" x2="${dx}" y2="${trayY(i + 1) - 2}" `
          + `stroke="${GHOST}" stroke-width="1.2" stroke-dasharray="2 2"/>`);
    }
  } else if (nTrays > 0) {
    p.push(`<rect x="${xL + 2}" y="${y0}" width="${wPx - 4}" height="${stackPx}" `
      + `fill="none" stroke="${METAL}" stroke-width="1.2" stroke-dasharray="3 3"/>`);
    p.push(text(cx, y0 + stackPx / 2,
      `${nTrays} tray${nTrays === 1 ? "" : "s"}`, "#445", 11, "middle"));
  }

  //  ---- the narrower section, as what it WOULD have needed -------------
  const feedStage = Math.round(d.kpis["feedStage"] ?? 0);
  const flood = d.kpis["floodApproach_max"], floodStage = d.kpis["floodStage"];
  if (vRect && vStrip && toScale && nTrays > 1 && feedStage > 1) {
    const rectIsSmall = vRect.value <= vStrip.value;
    const sw = Math.min(vRect.value, vStrip.value) * pxPerM;
    //  The rectifying trays are those ABOVE the feed stage; that is
    //  `TrayHydraulics`' own rule (`s.index < feedStage`), read here rather
    //  than reinvented.
    const yA = rectIsSmall ? top + 6 : trayY(feedStage) - pitch / 2;
    const yB = rectIsSmall ? trayY(feedStage) - pitch / 2 : bot - 6;
    if (Math.abs(sw - wPx) > 1.5) {
      p.push(`<rect x="${cx - sw / 2}" y="${yA}" width="${sw}" `
        + `height="${Math.max(0, yB - yA)}" fill="none" stroke="${GHOST}" `
        + `stroke-width="1.2" stroke-dasharray="5 3"/>`);
      //  It is drawn AT SCALE, which on this witness means it very nearly
      //  coincides with the wall -- 8.08 % of 1.32 m is 2 px.  That IS the
      //  finding, so it is annotated rather than exaggerated: a dashed line
      //  pushed apart to be visible would be a drawing of a gap that is not
      //  there.
      const small = rectIsSmall ? vRect : vStrip;
      p.push(text(cx - sw / 2 - 8, (yA + yB) / 2 - 18,
        `⌀${fmt(small)}`, GHOST, 9.5, "end"));
      p.push(text(cx - sw / 2 - 8, (yA + yB) / 2 - 7,
        `${rectIsSmall ? "rectifying" : "stripping"} only`, GHOST, 9.5, "end"));
    }
  }

  //  ---- the section bracket -------------------------------------------
  if (nTrays > 1 && feedStage > 1 && feedStage <= nTrays && drawEach) {
    const bx = xL - 26, yF = trayY(feedStage);
    p.push(`<line x1="${bx}" y1="${trayY(1)}" x2="${bx}" y2="${yF - pitch / 2}" `
      + `stroke="${GHOST}" stroke-width="1.4"/>`);
    p.push(`<line x1="${bx}" y1="${yF - pitch / 2}" x2="${bx}" y2="${trayY(nTrays)}" `
      + `stroke="${GHOST}" stroke-width="1.4" stroke-dasharray="4 3"/>`);
    p.push(text(bx - 5, (trayY(1) + yF) / 2, "rectifying", "#667", 10, "end"));
    p.push(text(bx - 5, (yF + trayY(nTrays)) / 2 + 8, "stripping", "#667", 10, "end"));
  }

  //  ---- the nozzles the topology knows ---------------------------------
  //  COLOURED BY TEMPERATURE, against the midpoint of the ports the sheet
  //  carries -- never against a constant, which would colour every column in
  //  the corpus by where its absolute temperatures happen to sit.
  const ports = [...d.shell.inlets, ...d.shell.outlets]
    .filter((q) => q.T !== undefined);
  const Ts = ports.map((q) => q.T as number);
  const mid = Ts.length > 0 ? (Math.min(...Ts) + Math.max(...Ts)) / 2 : undefined;
  const inkOf = (T: number | undefined) =>
    T === undefined || mid === undefined ? METAL : (T >= mid ? WARM : COOL);
  const degC = (T: number | undefined) =>
    T === undefined ? "" : `  ${(T - 273.15).toFixed(1)} °C`;

  const feedPort = d.shell.inlets[0];
  const nozzle = (y: number, side: "L" | "R", label: string, ink: string) => {
    const x0 = side === "L" ? xL - 40 : xR;
    const x1 = side === "L" ? xL : xR + 40;
    p.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${ink}" `
      + `stroke-width="3.5"/>`);
    p.push(text(side === "L" ? x0 - 4 : x1 + 4, y - 5, label, ink, 10,
                side === "L" ? "end" : "start"));
  };

  const yFeed = nTrays > 1 && feedStage >= 1 && feedStage <= nTrays
    ? trayY(feedStage) : (top + bot) / 2;
  if (feedPort)
    nozzle(yFeed, "L",
      `${feedPort.global || "feed"}${degC(feedPort.T)}`, inkOf(feedPort.T));
  if (feedStage >= 1)
    p.push(text(xL - 44, yFeed + 9,
      marked(`stage ${feedStage}`, "declared"), PROVENANCE_INK.declared, 10, "end"));

  //  ---- the auxiliaries, drawn only where the run sized them -----------
  const box = (x: number, y: number, w: number, h: number, label: string,
               sub: string) => {
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" `
      + `fill="#e2e7ec" stroke="${INK}" stroke-width="1.3"/>`);
    p.push(text(x + w / 2, y + h / 2 - 2, label, INK, 11, "middle"));
    p.push(text(x + w / 2, y + h / 2 + 13, sub, "#667", 9, "middle"));
  };
  //  A LINE'S LABEL IS PLACED, NEVER GUESSED FROM ITS MIDPOINT.  The first
  //  version put each label at the polyline's middle vertex, which dropped
  //  "overhead vapour" on top of the condenser box and "to reboiler" on top of
  //  "return".  A picture whose labels collide is a picture a reader has to
  //  decode, and the coordinates are known here.
  const line = (pts: [number, number][], ink: string,
                label?: string, at?: [number, number],
                anchor: "start" | "middle" | "end" = "start") => {
    p.push(`<polyline points="${pts.map(([a, b]) => `${a},${b}`).join(" ")}" `
      + `fill="none" stroke="${ink}" stroke-width="2.2"/>`);
    if (label && at) p.push(text(at[0], at[1], label, "#667", 9.5, anchor));
  };

  const topOut = d.shell.outlets[0], botOut = d.shell.outlets[1];
  const coldInk = inkOf(topOut?.T), hotInk = inkOf(botOut?.T);
  const BX = 500, BW = 118, PROD = 690;      // aux column, product line end
  if (d.hasCondenser) {
    box(BX, 44, BW, 38, "condenser", "shell-and-tube");
    line([[xR, top + 14], [452, top + 14], [452, 63], [BX, 63]], coldInk,
         "overhead vapour", [xR + 6, top + 8]);
    if (d.hasRefluxDrum) {
      box(BX, 118, BW, 38, "reflux drum", "condensate holdup");
      line([[BX + BW / 2, 82], [BX + BW / 2, 118]], coldInk);
      line([[BX, 137], [428, 137], [428, top + 32], [xR, top + 32]], coldInk,
           "reflux", [xR + 6, top + 45]);
      if (topOut)
        line([[BX + BW, 137], [PROD, 137]], coldInk,
             `${topOut.global || "distillate"}${degC(topOut.T)}`,
             [BX + BW + 6, 132]);
    } else if (topOut) {
      line([[BX + BW, 63], [PROD, 63]], coldInk,
           `${topOut.global || "distillate"}${degC(topOut.T)}`,
           [BX + BW + 6, 58]);
    }
  } else if (topOut) {
    nozzle(top + 14, "R", `${topOut.global}${degC(topOut.T)}`, coldInk);
  }

  if (d.hasReboiler) {
    box(BX, 318, BW, 38, "reboiler", "shell-and-tube");
    line([[xR, bot - 10], [452, bot - 10], [452, 347], [BX, 347]], hotInk,
         "to reboiler", [xR + 6, bot - 14]);
    line([[BX, 327], [428, 327], [428, bot - 30], [xR, bot - 30]], hotInk,
         "vapour return", [xR + 6, bot - 34]);
    if (botOut)
      line([[BX + BW, 347], [PROD, 347]], hotInk,
           `${botOut.global || "bottoms"}${degC(botOut.T)}`,
           [BX + BW + 6, 342]);
  } else if (botOut) {
    nozzle(bot - 10, "R", `${botOut.global}${degC(botOut.T)}`, hotInk);
  }

  //  ---- WHICH TRAY IS THE TIGHT ONE, marked where it IS -----------------
  //  A flood approach reported only as a number in a caption leaves the reader
  //  counting tray lines to find it.  The label goes on the left, where the
  //  feed nozzle is not.
  if (flood !== undefined && floodStage !== undefined && drawEach
      && floodStage >= 1 && floodStage <= nTrays) {
    const yW = trayY(Math.round(floodStage));
    p.push(`<line x1="${xL - 22}" y1="${yW}" x2="${xL - 2}" y2="${yW}" `
      + `stroke="${PROVENANCE_INK.choupo}" stroke-width="1.4"/>`);
    p.push(text(xL - 26, yW + 3,
      marked(`worst tray ${(flood * 100).toFixed(1)} % of flood`, "choupo"),
      PROVENANCE_INK.choupo, 10, "end"));
  }

  //  ---- the dimensions, each with its provenance -----------------------
  //  `diameterDesigned` is the ENGINE's own answer to who chose the diameter,
  //  published as a KPI exactly so that a reader downstream does not have to
  //  infer it by comparing numbers.  Absent, the drawing says the run did not
  //  state it rather than assuming either answer.
  const designedKpi = d.kpis["diameterDesigned"];
  const dWho: Provenance | null = designedKpi === undefined
    ? null : (designedKpi !== 0 ? "choupo" : "declared");
  const dInk = dWho === null ? "#777" : PROVENANCE_INK[dWho];
  const dLabel = vD
    ? (dWho === null ? `D ${fmt(vD)} (provenance not published)`
                     : marked(`D ${fmt(vD)}`, dWho))
    : "D not published";
  //  the diameter dimension line, across the top of the tower
  p.push(`<line x1="${xL}" y1="${top - 16}" x2="${xR}" y2="${top - 16}" `
    + `stroke="${dInk}" stroke-width="1.2"/>`);
  p.push(text(cx, top - 22, dLabel, dInk, 11, "middle"));

  //  the height dimension line, down the right of the tower
  const hx = xR + 22;
  if (vH) {
    p.push(`<line x1="${hx}" y1="${top}" x2="${hx}" y2="${bot}" `
      + `stroke="${PROVENANCE_INK.choupo}" stroke-width="1.2"/>`);
    p.push(`<text x="${hx + 12}" y="${(top + bot) / 2}" fill="`
      + `${PROVENANCE_INK.choupo}" font-size="11" font-family="sans-serif" `
      + `text-anchor="middle" transform="rotate(-90 ${hx + 12} `
      + `${(top + bot) / 2})">${esc(marked(`H ${fmt(vH)}`, "choupo"))}</text>`);
  }

  //  ---- the notes that belong BESIDE the picture ----------------------
  const notes: { text: string; who: Provenance | null }[] = [];
  const nStages = d.kpis["nStages"];
  if (nStages !== undefined)
    notes.push({ text: `${Math.round(nStages)} equilibrium stages`,
                 who: "declared" });
  if (nTrays > 0)
    notes.push({ text: `${nTrays} trays rated`, who: "choupo" });
  if (vSpacing)
    notes.push({ text: `tray spacing ${fmt(vSpacing)}`, who: "declared" });
  if (feedStage >= 1)
    notes.push({ text: `feed on stage ${feedStage}`, who: "declared" });
  if (vRect)
    notes.push({ text: `the rectifying trays need ⌀${fmt(vRect)}`,
                 who: "choupo" });
  if (vStrip)
    notes.push({ text: `the stripping trays need ⌀${fmt(vStrip)}`,
                 who: "choupo" });
  if (vGap)
    notes.push({
      text: `the two sections are ${(vGap.value * 100).toFixed(2)} % apart, so `
        + `Choupo sizes the shell STRAIGHT at the wider one and prices no `
        + `transition cone — the dashed outline is what the narrower section `
        + `would have needed, not a wall anybody would build`,
      who: null });
  if (flood !== undefined)
    notes.push({
      text: `the worst tray runs at ${(flood * 100).toFixed(1)} % of flood`
        + (floodStage !== undefined && floodStage > 0
          ? `, and it is stage ${Math.round(floodStage)}` : ""),
      who: "choupo" });

  return {
    svg: `<svg viewBox="0 0 ${W} ${HH}" width="100%" style="max-width:${W}px" `
      + `role="img" aria-label="distillation tower schematic">`
      + p.join("") + "</svg>",
    notes,
    toScale,
    traysDrawn,
    nTrays,
  };
}

/*  ---- The rotary pressure exchanger (DEV.md 4c C192) -------------------- */

/** What the exchanger drawing decided, so the caller can repeat it in prose. */
export interface PressureExchangerSchematic {
  svg: string;
  /** Notes that belong BESIDE the picture (an SVG has no reflow). */
  notes: { text: string; who: Provenance | null }[];
  /** The rotor count the sheet published, or 0 when it published none. */
  rotors: number;
}

/** THE ROTOR, ITS DUCTS, THE FOUR PORTS AND THE BOOSTER -- drawn from the
 *  `pressureExchanger` sheet alone (DEV.md 4c C192).
 *
 *  WHAT IS DRAWN AND FROM WHERE.  The rotor is a horizontal cylinder with
 *  its ducts suggested as lines: the sheet carries no rotor diameter, no
 *  length and no duct count (the sizer publishes none -- the rotor's
 *  hydraulics are not modelled), so the cylinder is NOMINAL and no dimension
 *  is written on it.  What IS lettered is what the sheet states: the four
 *  ports with their stream names and the PRESSURES the run wrote on them
 *  (the sheet's own `inlets {}` / `outlets {}`, in the order the unit binds
 *  them: inlet 0 the brine at high pressure, inlet 1 the seawater at low
 *  pressure, outlet 0 the pressurised seawater, outlet 1 the spent brine);
 *  the rotor count and the rated flow per unit from `sizing {}`; the HP-side
 *  loss and the booster's hydraulic duty beside a booster box drawn on the
 *  high-pressure outlet; the three declared device parameters.
 *
 *  PROVENANCE IN TWO CHANNELS, as on the column: the rated flow, the
 *  efficiency, the mixing and the leakage are the CASE's (declared), the
 *  rotor count, the recovered pressure, the pressure drops and the booster
 *  duty are Choupo's; the design pressure is whichever the basis sentence
 *  says, and the drawing does not parse that sentence -- it writes
 *  "provenance not published" for it.  A port whose pressure the sheet did
 *  not carry is drawn with its name and no number. */
export function pressureExchangerSvg(sheet: DesignSheet): PressureExchangerSchematic {
  const W = 800, HH = 300;
  const p: string[] = [];

  const vRotors = sizingValue(sheet, "rotors");
  const vRated = sizingValue(sheet, "ratedFlowPerUnit");
  const vPerRotor = sizingValue(sheet, "flowPerRotor");
  const vDpHP = sizingValue(sheet, "dP_HP");
  const vDpLP = sizingValue(sheet, "dP_LP");
  const vRec = sizingValue(sheet, "P_recovered");
  const vBoost = sizingValue(sheet, "boosterPower");
  const vEta = sizingValue(sheet, "efficiency");
  const vMix = sizingValue(sheet, "mixing");
  const vLeak = sizingValue(sheet, "leakage");
  const vSal = sizingValue(sheet, "salinityIncrease");
  const vPdes = sizingValue(sheet, "pressureDesign");
  const rotors = Math.max(0, Math.round(vRotors?.value ?? 0));

  //  ---- the rotor: a nominal cylinder, no dimension on it -----------------
  const xL = 250, xR = 550, yT = 95, yB = 205, ry = 20;
  const cy = (yT + yB) / 2;
  p.push(`<path d="M${xL} ${yT} H${xR} a${ry} ${(yB - yT) / 2} 0 0 1 0 ${yB - yT} `
    + `H${xL} a${ry} ${(yB - yT) / 2} 0 0 1 0 ${-(yB - yT)} z" fill="${STEEL}" `
    + `stroke="${INK}" stroke-width="1.6"/>`);
  //  the near end cover, an ellipse, and the ducts as lines along the rotor
  p.push(`<ellipse cx="${xL}" cy="${cy}" rx="${ry}" ry="${(yB - yT) / 2}" `
    + `fill="#d6dde5" stroke="${INK}" stroke-width="1.4"/>`);
  for (let i = 1; i <= 5; i++) {
    const y = yT + ((yB - yT) * i) / 6;
    p.push(`<line x1="${xL + ry}" y1="${y}" x2="${xR - 4}" y2="${y}" `
      + `stroke="${METAL}" stroke-width="1.1" stroke-dasharray="6 4"/>`);
  }
  p.push(text((xL + xR) / 2, cy + 4, "ceramic rotor · ducts", "#556", 11, "middle"));
  p.push(text((xL + xR) / 2, yB + 16, "rotor geometry not published: nominal",
    GHOST, 9.5, "middle"));

  //  ---- the four ports, lettered with stream name and pressure -----------
  const bar = (P: number | undefined) =>
    P === undefined ? "" : `  ${(P / 1e5).toFixed(2)} bar`;
  const hpIn = sheet.inlets[0], lpIn = sheet.inlets[1];
  const hpOut = sheet.outlets[0], lpOut = sheet.outlets[1];
  const port = (x0: number, x1: number, y: number, label: string, ink: string,
                anchorX: number, anchor: "start" | "end", dy: number) => {
    p.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${ink}" `
      + `stroke-width="3.5"/>`);
    p.push(text(anchorX, y + dy, label, ink, 10, anchor));
  };
  //  High-pressure side on the RIGHT end (brine in, pressurised seawater
  //  out); low-pressure side on the LEFT (seawater in, spent brine out).
  if (hpIn) port(xR + ry, xR + ry + 60, yT + 25,
    `${hpIn.global || "highPressureIn"}${bar(hpIn.P)}`, WARM, xR + ry + 64, "start", 4);
  if (hpOut) port(xR + ry, xR + ry + 60, yB - 25,
    `${hpOut.global || "highPressureOut"}${bar(hpOut.P)}`, COOL, xR + ry + 64, "start", 4);
  if (lpIn) port(xL - ry - 60, xL - ry, yB - 25,
    `${lpIn.global || "lowPressureIn"}${bar(lpIn.P)}`, COOL, xL - ry - 64, "end", 4);
  if (lpOut) port(xL - ry - 60, xL - ry, yT + 25,
    `${lpOut.global || "lowPressureOut"}${bar(lpOut.P)}`, WARM, xL - ry - 64, "end", 4);
  //  arrows of direction, as words at the ends: in / out
  p.push(text(xR + ry + 30, yT + 14, "HP in", "#667", 9, "middle"));
  p.push(text(xR + ry + 30, yB - 12, "HP out", "#667", 9, "middle"));
  p.push(text(xL - ry - 30, yB - 12, "LP in", "#667", 9, "middle"));
  p.push(text(xL - ry - 30, yT + 14, "LP out", "#667", 9, "middle"));

  //  ---- the booster, beside the high-pressure outlet ----------------------
  //  A box only: Choupo sizes no booster here (the flowsheet's own pump unit
  //  carries its shaft power); what the sheet states is the HYDRAULIC duty
  //  the device leaves to it, and that is what is written.
  const BX = 700, BY = yB - 44, BW = 80, BH = 38;
  p.push(`<rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="5" `
    + `fill="#e2e7ec" stroke="${INK}" stroke-width="1.3"/>`);
  p.push(text(BX + BW / 2, BY + 16, "booster", INK, 11, "middle"));
  p.push(text(BX + BW / 2, BY + 29,
    vBoost ? marked(fmt(vBoost), "choupo") : "duty not published",
    vBoost ? PROVENANCE_INK.choupo : "#777", 9, "middle"));
  p.push(`<line x1="${xR + ry + 60}" y1="${yB - 25}" x2="${BX}" y2="${yB - 25}" `
    + `stroke="${COOL}" stroke-width="2" stroke-dasharray="4 3"/>`);

  //  ---- the dimensions the sheet does carry, each with its provenance ----
  const dimY = 36;
  if (vRotors)
    p.push(text(xL, dimY, marked(`${rotors} rotor${rotors === 1 ? "" : "s"} in parallel`,
      "choupo"), PROVENANCE_INK.choupo, 11, "start"));
  if (vRated)
    p.push(text(xL, dimY + 16, marked(`rated ${fmt(vRated)} per unit`, "declared"),
      PROVENANCE_INK.declared, 10.5, "start"));
  if (vPerRotor)
    p.push(text(xL, dimY + 31, marked(`${fmt(vPerRotor)} LP flow per rotor`, "choupo"),
      PROVENANCE_INK.choupo, 10.5, "start"));
  if (vRec)
    p.push(text(xR + ry + 64, cy + 4, marked(`recovers ${fmt(vRec)}`, "choupo"),
      PROVENANCE_INK.choupo, 10.5, "start"));
  if (vDpHP)
    p.push(text(xR + ry + 64, yB + 18, marked(`HP side loses ${fmt(vDpHP)}`, "choupo"),
      PROVENANCE_INK.choupo, 10, "start"));
  if (vDpLP)
    p.push(text(xL - ry - 64, yB + 18, marked(`LP side loses ${fmt(vDpLP)}`, "choupo"),
      PROVENANCE_INK.choupo, 10, "end"));
  const dLabel = vPdes
    ? `design pressure ${fmt(vPdes)} (provenance not published)` : "design pressure not published";
  p.push(text(xL, HH - 14, dLabel, "#777", 10, "start"));

  //  ---- the notes that belong BESIDE the picture ------------------------
  const notes: { text: string; who: Provenance | null }[] = [];
  if (vEta) notes.push({ text: `pressure-transfer efficiency ${fmt(vEta)}`, who: "declared" });
  if (vMix) notes.push({ text: `volumetric mixing ${fmt(vMix)}`, who: "declared" });
  if (vLeak) notes.push({ text: `leakage (lubrication flow) ${fmt(vLeak)}`, who: "declared" });
  if (vSal)
    notes.push({ text: `the feed's salinity rises ${(vSal.value * 100).toFixed(2)} % through the device`,
                 who: "choupo" });
  if (vRotors)
    notes.push({ text: `${rotors} rotor${rotors === 1 ? "" : "s"}: ceil(LP flow / rated flow per unit)`,
                 who: "choupo" });
  notes.push({
    text: "the rotor is drawn NOMINAL: the sheet publishes no rotor diameter, "
      + "length or duct count, and the device is NOT costed (no Turton set "
      + "covers it)",
    who: null });

  return {
    svg: `<svg viewBox="0 0 ${W} ${HH}" width="100%" style="max-width:${W}px" `
      + `role="img" aria-label="rotary pressure exchanger schematic">`
      + p.join("") + "</svg>",
    notes,
    rotors,
  };
}

/*  ---- One TRAIN of a desalination plant (DEV.md 4c C199 phase B) -------- */

/** The roles of the sheets of ONE train, found from the STREAMS the sheets'
 *  ports name -- never from unit names, which are the case's. */
export interface TrainRoles {
  hpPump?: DesignSheet; booster?: DesignSheet; pass2Pump?: DesignSheet;
  px?: DesignSheet; ro1?: DesignSheet; ro2a?: DesignSheet; ro2b?: DesignSheet;
}

export interface TrainSchematic {
  svg: string;
  notes: { text: string; who: Provenance | null }[];
  roles: TrainRoles;
  /** Roles the sheets did not resolve; empty when the drawing is complete. */
  unresolved: string[];
}

/** Does this sheet belong to a plant sized per train? */
export function isTrainSheet(sheet: DesignSheet | null | undefined): boolean {
  return !!sheet && sizingValue(sheet, "trains") !== undefined
    && ["ratedMachine", "pressureExchanger", "membraneBank"].includes(sheet.equipment);
}

const outNames = (s: DesignSheet): string[] => s.outlets.map((p) => p.global);
const inNames = (s: DesignSheet): string[] => s.inlets.map((p) => p.global);

/** Resolve the seven roles from the train's sheets by their streams: the
 *  exchanger's HP-side inlet is the first bank's brine; the booster takes the
 *  exchanger's pressurised outlet; the pass-2 pump feeds a bank that is not the
 *  first; the second bank takes the first one's concentrate; the pump left over
 *  is the high-pressure pump.  A role it cannot find stays undefined and is
 *  NAMED in `unresolved`. */
export function trainRoles(sheets: readonly DesignSheet[]): { roles: TrainRoles; unresolved: string[] } {
  const roles: TrainRoles = {};
  const pumps = sheets.filter((s) => s.equipment === "ratedMachine");
  const banks = sheets.filter((s) => s.equipment === "membraneBank");
  roles.px = sheets.find((s) => s.equipment === "pressureExchanger");
  const brine = roles.px?.inlets[0]?.global, pxHP = roles.px?.outlets[0]?.global;
  roles.ro1 = banks.find((b) => brine !== undefined && outNames(b).includes(brine));
  roles.booster = pumps.find((q) => pxHP !== undefined && inNames(q).includes(pxHP));
  const others = banks.filter((b) => b !== roles.ro1);
  roles.pass2Pump = pumps.find((q) => q !== roles.booster
    && others.some((b) => outNames(q).some((o) => inNames(b).includes(o))));
  roles.ro2a = others.find((b) => roles.pass2Pump !== undefined
    && outNames(roles.pass2Pump).some((o) => inNames(b).includes(o)));
  roles.ro2b = others.find((b) => b !== roles.ro2a && roles.ro2a !== undefined
    && outNames(roles.ro2a).some((o) => inNames(b).includes(o)));
  roles.hpPump = pumps.find((q) => q !== roles.booster && q !== roles.pass2Pump);
  const names: [keyof TrainRoles, string][] = [["hpPump", "high-pressure pump"], ["booster", "booster"],
    ["pass2Pump", "second-pass pump"], ["px", "pressure-exchanger array"], ["ro1", "first-pass banks"],
    ["ro2a", "second-pass bank a"], ["ro2b", "second-pass bank b"]];
  return { roles, unresolved: names.filter(([k]) => !roles[k]).map(([, n]) => n) };
}

/** ONE TRAIN: the high-pressure pump, the exchanger array and its booster,
 *  the first-pass banks, the second-pass pump and banks (RO2a, RO2b), and the
 *  permeate, spent-brine and recycle lines, every count and flow read from the
 *  train's own sheets.  The flows of a bank are its UNIT's plant streams
 *  divided by the declared trains (computed, and said so); a pump's and the
 *  array's are the per-train numbers their sheets carry.  Roles come from the
 *  streams (`trainRoles`); a train whose sheets do not resolve draws a
 *  LABELLED BOX naming the roles it could not find. */
export function trainSchematicSvg(sheets: readonly DesignSheet[],
                                  allSheets: readonly DesignSheet[] = []): TrainSchematic {
  const { roles, unresolved } = trainRoles(sheets);
  const W = 1220, H = 450;
  if (unresolved.length > 0) {
    const svg = `<svg viewBox="0 0 520 120" width="100%" style="max-width:520px" role="img" `
      + `aria-label="train schematic: not drawn"><rect x="20" y="20" width="480" height="80" rx="6" `
      + `fill="${STEEL}" stroke="${INK}" stroke-width="1.4"/>`
      + text(260, 52, "Train schematic: not drawn", INK, 13, "middle")
      + text(260, 74, `no sheet resolves: ${unresolved.join(", ")}`, "#556", 10.5, "middle") + "</svg>";
    return { svg, roles, unresolved,
      notes: [{ text: "The train is drawn from the streams its sheets name; the roles above were not found.", who: null }] };
  }
  const R = roles as Required<TrainRoles>;
  const N = sizingValue(R.px, "trains")?.value ?? sizingValue(R.ro1, "trains")?.value ?? 1;
  const p: string[] = [];
  const line = (pts: [number, number][], ink: string, arrow = true, w = 2.4): void => {
    p.push(`<polyline points="${pts.map((q) => q.join(",")).join(" ")}" fill="none" stroke="${ink}" `
      + `stroke-width="${w}"${arrow ? ' marker-end="url(#ah)"' : ""}/>`);
  };
  const row = (x: number, y: number, s: string, who: Provenance | null, size = 9.5): void => {
    p.push(text(x, y, who ? marked(s, who) : s, who ? PROVENANCE_INK[who] : "#556", size, "start"));
  };
  const node = (x: number, y: number, w: number, h: number, title: string,
                rows: { t: string; who: Provenance | null }[]): void => {
    p.push(`<rect data-node="${esc(title)}" x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#eef1f5" stroke="${INK}" stroke-width="1.4"/>`);
    p.push(text(x + 6, y + 14, title, INK, 11, "start", ' font-weight="600"'));
    rows.forEach((r, i) => row(x + 6, y + 28 + i * 12.5, r.t, r.who, 8.2));
  };
  const v = (s: DesignSheet, k: string, d = 4): string => fmt(sizingValue(s, k), d);
  const perTrainFlow = (port: { mdot?: number } | undefined): string =>
    port?.mdot === undefined ? "flow not published" : `${Number((port.mdot * 3.6 / N).toPrecision(4))} t/h per train`;

  const pumpRows = (s: DesignSheet) => [
    { t: `${v(s, "pumpsPerTrain")} pump${sizingValue(s, "pumpsPerTrain")?.value === 1 ? "" : "s"} of ${v(s, "maxFlowPerUnit")} max`, who: "declared" as Provenance },
    { t: `${v(s, "flowPerPump")} each`, who: "choupo" as Provenance },
    { t: `${v(s, "shaftPowerPerPump")} shaft each`, who: "choupo" as Provenance },
    { t: `to ${v(s, "P_out")}`, who: "choupo" as Provenance },
  ];
  //  the bank's three header bores (feed / brine / permeate), read from its
  //  `pipeHeader` sheets of THIS train; no row when none is on the run
  const headerRow = (s: DesignSheet): { t: string; who: Provenance | null }[] => {
    const bank = readBank(s);
    if (!bank.ok) return [];
    const h = headersOf(allSheets, bank.bank);
    const f = (r: "feed" | "brine" | "permeate"): string => h[r] ? String(Number(h[r]!.diameter.toPrecision(3))) : "-";
    return Object.keys(h).length === 0 ? [] : [{ t: `headers \u00d8 ${f("feed")} / ${f("brine")} / ${f("permeate")} m`, who: "declared" }];
  };
  const bankRows = (s: DesignSheet, inP?: { mdot?: number }, perm?: { mdot?: number }) => [
    { t: `${v(s, "vessels")} vessels x ${v(s, "elementsPerVessel")} elements`, who: "unit" as Provenance },
    { t: `${v(s, "racks")} rack(s) of ${v(s, "tiers")} tiers x ${v(s, "vesselsPerTier")}`, who: "choupo" as Provenance },
    { t: `feed ${perTrainFlow(inP)}`, who: "choupo" as Provenance },
    { t: `permeate ${perTrainFlow(perm)}`, who: "choupo" as Provenance },
    ...headerRow(s),
  ];

  //  ---- the first row: feed, HP pump, join, first pass, second pass ------
  line([[10, 110], [90, 110]], COOL);
  p.push(`<circle cx="55" cy="110" r="3.5" fill="${COOL}"/>`);
  node(90, 70, 160, 84, R.hpPump.unit, pumpRows(R.hpPump));
  line([[250, 110], [310, 110]], COOL);
  p.push(`<circle cx="290" cy="110" r="3.5" fill="${COOL}"/>`);
  node(310, 62, 190, 100, `${R.ro1.unit} (first pass)`, bankRows(R.ro1, R.ro1.inlets[0], R.ro1.outlets[1]));
  line([[500, 110], [540, 110]], "#3a9a6a");
  node(540, 70, 160, 84, R.pass2Pump.unit, pumpRows(R.pass2Pump));
  line([[700, 110], [740, 110]], COOL);
  node(740, 62, 190, 100, `${R.ro2a.unit} (2nd pass)`, bankRows(R.ro2a, R.ro2a.inlets[0], R.ro2a.outlets[1]));
  line([[930, 100], [970, 100]], WARM);
  node(970, 62, 190, 100, `${R.ro2b.unit} (2nd pass)`, bankRows(R.ro2b, R.ro2b.inlets[0], R.ro2b.outlets[1]));
  //  permeate to the product, and the recycle of the second pass's concentrate
  line([[835, 162], [835, 196], [1065, 196]], "#3a9a6a", false);
  line([[1065, 162], [1065, 196]], "#3a9a6a", false);
  p.push(`<line x1="1065" y1="196" x2="1205" y2="196" stroke="#3a9a6a" stroke-width="2.4" marker-end="url(#ah)"/>`);
  row(880, 214, `product ${perTrainFlow({ mdot: ((R.ro2a.outlets[1]?.mdot ?? NaN) + (R.ro2b.outlets[1]?.mdot ?? NaN)) })} (both permeates)`, "choupo");
  line([[1160, 100], [1195, 100], [1195, 30], [30, 30], [30, 110]], WARM, false);
  p.push(`<circle cx="30" cy="110" r="3.5" fill="${WARM}"/>`);
  row(560, 24, `reject recycled to the feed: ${perTrainFlow(R.ro2b.outlets[0])}`, "choupo");

  //  ---- the second row: the pressure-exchanger array and its booster -----
  const px = R.px;
  node(620, 245, 170, 118, `${px.unit} (array)`, [
    { t: `${v(px, "rotors")} devices`, who: "choupo" },
    { t: `${v(px, "flowPerRotor")} each`, who: "choupo" },
    { t: `rated ${v(px, "ratedFlowPerUnit")} per device`, who: "declared" },
    ...(sizingValue(px, "minFlowPerUnit") ? [{ t: `window from ${v(px, "minFlowPerUnit")}`, who: "declared" as Provenance }] : []),
    { t: `recovers ${v(px, "P_recovered")}`, who: "choupo" },
    { t: `booster duty ${v(px, "boosterPower")}`, who: "choupo" },
  ]);
  node(330, 292, 160, 84, R.booster.unit, pumpRows(R.booster));
  line([[440, 158], [440, 285], [620, 285]], WARM);                        // first-pass brine to the HP side
  row(446, 262, `brine ${perTrainFlow(R.ro1.outlets[0])}`, "choupo");
  line([[620, 330], [490, 330]], COOL);                                    // pressurised seawater to the booster
  line([[330, 330], [290, 330], [290, 112]], COOL);                       // booster to the join
  line([[55, 110], [55, 410], [840, 410], [840, 330], [790, 330]], COOL);  // low-pressure feed to the array
  row(110, 404, "low-pressure feed to the array (the split of the feed)", null);
  line([[790, 285], [1100, 285]], WARM);                                   // spent brine
  row(810, 276, `spent brine to the outfall ${perTrainFlow(px.outlets[1])}`, "choupo");

  const defs = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" `
    + `orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${INK}"/></marker></defs>`;
  const notes: TrainSchematic["notes"] = [
    { text: `One of ${N} identical trains: the plant's flows divide by ${N} (the declared trains); a bank's `
      + "feed, permeate and brine below are those streams divided by it (computed), a pump's and the array's "
      + "are the per-train numbers their sheets carry.", who: "choupo" },
    { text: "Each box's rows carry their provenance in ink and in the word: the case's declared maxima and "
      + "ratings, the unit's own counts, Choupo's computed flows.", who: null },
    { text: "A bank's `headers` row lists its feed / brine / permeate header bores in metres (the nominal bore the "
      + "header sizer picked from the case's declared list); the rack elevation draws them.", who: "declared" },
    { text: "Roles are found from the streams the sheets name, never from unit names. Pipes, valves and "
      + "headers are not drawn here (see the rack elevation); the lines are the flowsheet's connections.", who: null },
  ];
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" `
    + `aria-label="one desalination train">${defs}${p.join("")}</svg>`, notes, roles, unresolved };
}


/*  ---- The registry ------------------------------------------------------ */

/** THE EQUIPMENT WORDS THIS MODULE CAN DRAW FROM A SPECIFICATION SHEET ALONE.
 *
 *  Keyed on the sheet's own `equipment` word -- the same registered-type word
 *  the sizers are keyed on -- so a new kind is one entry here and no reader
 *  changes.  It is deliberately SMALL: `shellTubeHX` is NOT in it, because a
 *  shell-and-tube sheet carries a bundle only when it is a Kern DESIGN, and
 *  that sheet is drawn by the exchanger datasheet (`case/hxDatasheet.ts`),
 *  which reads it whole.  Every other `shellTubeHX` sheet -- a column's
 *  condenser and reboiler among them -- is sized by area alone, and drawing a
 *  bundle from `A` would invent the very numbers nobody computed.
 *
 *  `sieveTrays` is the word that identifies a distillation TOWER, and the
 *  tower is drawn from the tray sheet TOGETHER WITH its `shell` sibling.  The
 *  shell's own word is `vessel` -- the same word a flash drum and this
 *  column's own reflux drum carry -- so keying the tower on `vessel` would
 *  draw a fourteen-tray tower on every drum in the corpus.  The trays are the
 *  fact that makes it a column.
 *
 *  `pressureExchanger` (DEV.md 4c C192) is drawn from its one sheet alone by
 *  `pressureExchangerSvg`: the rotor nominal, the four ports with the
 *  pressures the run wrote, the rotor count and rated flow, the booster box. */
export const SCHEMATIC_KINDS: readonly string[] = ["sieveTrays", "pressureExchanger", "membraneBank"];

/** Whether this module has a real drawing for an equipment word. */
export function hasSchematic(equipment: string): boolean {
  return SCHEMATIC_KINDS.includes(equipment);
}

/** WHY a kind has no schematic, in the kind's own terms.  Two different
 *  reasons, and collapsing them would tell a reader that Choupo has no picture
 *  of a shell-and-tube exchanger, which is false -- it has one, on a page that
 *  can reach the inputs it needs. */
export function noSchematicReason(equipment: string): string {
  if (equipment === "shellTubeHX")
    return "No schematic here: this sheet sizes the exchanger by its area "
      + "alone and carries no bundle — tube count, passes, baffles, shell "
      + "ID — to draw.  A sheet from a Kern design (`design { method Kern; }` "
      + "in the postDict) carries one, and the exchanger datasheet draws it.";
  return `No schematic is registered for equipment kind '${equipment}'. `
    + "A labelled box beats a wrong picture: nothing is approximated from "
    + "another kind's geometry.";
}
