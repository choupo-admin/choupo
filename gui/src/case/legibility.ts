/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * legibility -- THE ONE MINIMUM TEXT SIZE, and what a zoomed drawing does
 * with a label that would fall below it (DEV.md 4c C168 slice 2, ruling (c):
 * "legibility wins over fitting the whole flowsheet").
 *
 * WHY.  The C168 audit measured the flowsheet and calculation-map labels at
 * 3.9-7.7 CSS px at 100 % and 1.9-3.9 px at 200 % browser zoom: both
 * canvases fit themselves to their box, so a label shrinks with the box and
 * browser zoom (WCAG 1.4.4) does NOTHING for them.  The C172 slice-3 general
 * measured the map at 4.7 px (zoom 0.52, 195 labels, all under 11 px).
 *
 * THE RULE (one number, every surface).  No text is RENDERED below
 * `MIN_TEXT_PX` CSS pixels -- its declared font size times every scale
 * between it and the screen (a canvas's zoom).  CSS pixels, so browser zoom
 * multiplies it: at 200 % an 11 px label is 22 device pixels.  On a fixed
 * surface (the chrome, the Workflow, a plot) it is a floor on the declared
 * size.  On a ZOOMED drawing it is decided here, per label, from the zoom:
 *
 *   show  the label is legible at this zoom (size x zoom >= the minimum);
 *   grow  a PRIMARY label (a unit's name, a block's title, a wire's phase
 *         letter) that would fall below it is drawn AT the minimum instead
 *         -- it grows in drawing units as the drawing shrinks -- so the
 *         overview still says what is what;
 *   hide  any other label that would fall below it is NOT drawn.  An
 *         illegible label is not information; the full graph pans and zooms
 *         to it.
 *
 * So the drawing at FIT is the SIMPLIFIED VIEW the ruling asks for (shapes,
 * wires, names), and the full graph is one zoom away.  A primary label stops
 * growing at `GROW_MAX` times its own size -- past that the names would
 * overlap their neighbours -- and is hidden too: the drawing is then a map
 * of shapes, which is what zooming all the way out is for.
 *
 * WHY 11 px.  It is the size the Workflow was already held to (C172 slice 3:
 * badges 11 px, text 12 px), the smallest size the GUI already used for
 * running secondary text (the outline's tags), and the platform floor for a
 * caption in the common interface guidelines (11 pt).  Smaller than 11 px is
 * where the audit found the illegible text (9 px badges, 4.7 px map labels);
 * larger would cost the dense chrome rows a second line.  It is a FLOOR, not
 * a style: text above it is untouched.
 *
 * PURE: no DOM.  `ui/legibilityFloor.ts` applies it to a rendered canvas.
 */

/** The smallest text any surface renders, in CSS pixels. */
export const MIN_TEXT_PX = 11;

/** How far a primary label may grow, as a multiple of its own size, before
 *  it is hidden with the rest (past it the names would overlap). */
export const GROW_MAX = 2.6;

export type Legibility = "show" | "grow" | "hide";

/** What a label of `fontPx` (its declared size, drawing units) does at
 *  `zoom` (drawing -> CSS px).  `primary`: it names what it sits on. */
export function legibilityOf(fontPx: number, zoom: number, primary: boolean): Legibility {
  if (!(fontPx > 0) || !(zoom > 0)) return "show";
  if (fontPx * zoom >= MIN_TEXT_PX - 0.01) return "show";
  if (!primary) return "hide";
  return MIN_TEXT_PX / zoom <= fontPx * GROW_MAX ? "grow" : "hide";
}

/** The size a grown label is drawn at, in drawing units. */
export function grownFontPx(zoom: number): number {
  return MIN_TEXT_PX / zoom;
}

/** The smallest zoom at which a label of `fontPx` is shown as declared. */
export function legibleZoom(fontPx: number): number {
  return MIN_TEXT_PX / fontPx;
}

/** A drawing's state, for its hint and for a measurement: `full` when every
 *  label is shown as declared, `overview` when any was grown or hidden. */
export function drawingLegibility(states: Iterable<Legibility>): "full" | "overview" {
  for (const s of states) if (s !== "show") return "overview";
  return "full";
}
