/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * nodeDetail -- how big the symbol is, and how short the box may get.
 *
 * WHY THIS EXISTS.  Vítor, three times across one day: the unit-operation
 * symbols are too small.  The first answer enlarged them, 34 -> 41 px, and he
 * came back -- because THE SYMBOL IS NOT SMALL, THE BOX IS BIG.  A full node
 * carries the symbol, the name, a type badge and up to three parameter
 * lines, so the silhouette is roughly a quarter of its own card.  Enlarging
 * it inside that card cannot fix the ratio without making the card bigger
 * still, and the card is ALREADY taller than its lane: `toGraph.ts` lays
 * siblings out at `Y_STEP = 130`.
 *
 * So the detail chip works the other way round: it REMOVES the badge row and
 * the parameter lines, the box shrinks, and the symbol grows into the space
 * that frees.  At 56 px on a short box the silhouette dominates AND the node
 * still has a smaller footprint than the 41 px full one -- the only option
 * that improves the ratio by shrinking rather than growing.
 *
 * NOTHING IS LOST, and that is what makes it safe to hide: a single click
 * opens the Properties card with the whole schema-driven operation block,
 * its prose and its display units, which is a strict SUPERSET of the two or
 * three lines the node drew.  A popup of its own was considered and rejected
 * -- it would be a fourth surface for one unit where the 2026-06-12 ruling
 * settled on exactly two (the Properties card, and the internals page).
 *
 * PURE, and not for tidiness: vitest here runs `environment: "node"` with no
 * jsdom, so nothing in this repository renders a React component and any
 * number left inline in `UnitNode` is held to nothing.  These two are the
 * decisions worth pinning; the drawing around them is not testable and is
 * not pretended to be.
 */

/** The full node's symbol, unchanged since 2026-09-22. */
export const SYMBOL_PX_FULL = 41;

/** The simple node's symbol: bigger on a box that is much shorter. */
export const SYMBOL_PX_SIMPLE = 56;

/** The shortest a simple node may be, whatever its ports. */
export const MIN_BOX_PX = 64;

/**
 * Vertical room one connection point needs.
 *
 * A handle is placed at a FRACTION of the border, so a unit with several
 * inlets packs them into whatever height the box has.  The dots are 11 px;
 * 22 leaves the same again between them, which is what keeps two wires
 * readable as two.  A NUMBER A HUMAN MUST CHECK BY LOOKING -- no test here
 * measures a pixel, and this module says so rather than implying otherwise.
 */
export const PORT_PITCH_PX = 22;

/** The symbol size for a node at this detail level. */
export function symbolSizeFor(showDetails: boolean): number {
  return showDetails ? SYMBOL_PX_FULL : SYMBOL_PX_SIMPLE;
}

/**
 * The minimum height a node must keep, or `undefined` to impose none.
 *
 * A FULL node imposes none: its own content is taller than any port count
 * would ask for, and a floor there would only fight the text.  A SIMPLE node
 * is short by design, so it takes the floor -- sized on the BUSIER side,
 * because it is the side with more ports that crowds, not the sum.
 */
export function nodeMinHeight(
  showDetails: boolean,
  nInputs: number,
  nOutputs: number,
): number | undefined {
  if (showDetails) return undefined;
  const ports = Math.max(nInputs, nOutputs, 0);
  return Math.max(MIN_BOX_PX, PORT_PITCH_PX * ports);
}
