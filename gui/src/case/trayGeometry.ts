/*---------------------------------------------------------------------------*\
  trayGeometry -- the PLAN of one sieve tray, from the fractions the case
  DECLARES, for the column datasheet's drawing (DEV.md 4c C337).

  WHAT THIS IS, AND WHAT IT IS NOT.  Pure geometry of a circle cut by two
  chords: no hydraulics.  The engine reads the tray as three DECLARED
  fractions and a diameter -- `TrayHydraulics.cpp:318-322`:

      A_T = pi D^2 / 4,  A_d = downcomerAreaFraction . A_T,
      A_a = A_T - 2 A_d  (the active, bubbling area),
      A_h = holeAreaFraction . A_a,  l_w = weirLengthFraction . D.

  It never draws the chord those fractions imply, and the two declarations
  are independent there: A_d sets the areas, l_w sets the weir crest, and
  nothing asks them to agree.  The drawing needs the chord, so this file
  solves the one equation that gives it (the segment whose area is A_d) and
  REPORTS how far the chord length it implies sits from the declared weir
  length -- a mismatch the reader should see, not one the drawing hides.

  THE HOLE PATCH IS A DRAWING AID, NOT A DESIGN.  A real deck is laid out
  by the fabricator; Choupo publishes no hole count and no layout.  The
  patch is a small window of the active area filled with an equilateral
  triangular pitch at the declared hole diameter, the pitch either DECLARED
  (`efficiency { holePitch; }`, read by the Syeda-Chuang model) or, when
  none is declared, the pitch at which a triangular array has the declared
  open-area fraction:  A_h/A_a = (pi/(2 sqrt 3)) (d_h/p)^2.  The patch's
  own open-area fraction is COUNTED from the holes drawn and printed beside
  the declared one, so the picture proves its own density.

  Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

/** pi / (2 sqrt 3): the open-area fraction of a triangular array at d = p. */
export const TRIANGULAR_PACKING = Math.PI / (2 * Math.sqrt(3));

/** The central angle theta (rad) of a circular segment whose area is the
 *  fraction `f` of the whole circle:  (theta - sin theta) / (2 pi) = f.
 *  Monotone on [0, 2 pi], solved by bisection (no starting guess to choose). */
export function segmentAngle(f: number): number {
  if (!(f > 0) || !(f < 1)) throw new Error(`segment area fraction ${f} outside (0, 1)`);
  let lo = 0, hi = 2 * Math.PI;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if ((mid - Math.sin(mid)) / (2 * Math.PI) < f) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface TrayPlan {
  D: number;                 // m
  A_T: number;               // m2
  A_d: number;               // m2, one downcomer
  A_a: number;               // m2, active area (A_T - 2 A_d)
  A_h: number | undefined;   // m2, holes (declared fraction x A_a)
  /** Half-angle of the downcomer segment (rad). */
  halfAngle: number;
  /** Distance from the centre to the chord (m). */
  chordOffset: number;
  /** Chord length implied by A_d (m), and as a fraction of D. */
  chordLength: number;
  chordFraction: number;
  /** Declared weir length (m) and fraction, when declared. */
  weirLength: number | undefined;
  weirFraction: number | undefined;
  /** Flow-path length between the two chords (m). */
  flowPath: number;
}

/** The plan of a single-pass crossflow tray: two equal downcomer segments,
 *  the active area between them (the engine's A_a = A_T - 2 A_d). */
export function trayPlan(D: number, downcomerFrac: number,
  weirLengthFrac?: number, holeAreaFrac?: number): TrayPlan {
  if (!(D > 0)) throw new Error("tray plan needs a positive diameter");
  if (!(downcomerFrac > 0 && downcomerFrac < 0.5))
    throw new Error(`downcomerAreaFraction ${downcomerFrac} outside (0, 0.5)`);
  const R = D / 2;
  const theta = segmentAngle(downcomerFrac);
  const half = theta / 2;
  const A_T = Math.PI * R * R;
  const A_d = downcomerFrac * A_T;
  const A_a = A_T - 2 * A_d;
  const chordLength = 2 * R * Math.sin(half);
  const chordOffset = R * Math.cos(half);
  return {
    D, A_T, A_d, A_a,
    A_h: holeAreaFrac !== undefined ? holeAreaFrac * A_a : undefined,
    halfAngle: half, chordOffset, chordLength,
    chordFraction: chordLength / D,
    weirLength: weirLengthFrac !== undefined ? weirLengthFrac * D : undefined,
    weirFraction: weirLengthFrac,
    flowPath: 2 * chordOffset,
  };
}

/** The triangular pitch at which holes of diameter `d` give open-area
 *  fraction `phi` of the perforated area. */
export function pitchForOpenArea(d: number, phi: number): number {
  return d * Math.sqrt(TRIANGULAR_PACKING / phi);
}

/** The open-area fraction of an infinite triangular array. */
export function openAreaOfPitch(d: number, p: number): number {
  return TRIANGULAR_PACKING * (d / p) ** 2;
}

export interface HolePatch {
  /** Hole centres in the window's own coordinates (m, origin top-left). */
  holes: [number, number][];
  /** The window (m): an integer number of pitches wide and of row pairs tall. */
  width: number;
  height: number;
  pitch: number;
  holeDiameter: number;
  /** Open-area fraction COUNTED from the holes whose centres fall in the
   *  window (each hole counted whole), over the window's area. */
  countedOpenArea: number;
  /** Open-area fraction of the infinite array at this pitch. */
  arrayOpenArea: number;
}

/** A representative rectangular patch of an equilateral-triangular hole array.
 *  The window is an integer number of row pairs tall and of pitches wide,
 *  so the counted fraction converges on the array's (and is tested within
 *  2 % of it). */
export function holePatch(d: number, pitch: number, columns = 12): HolePatch {
  if (!(d > 0) || !(pitch > d)) throw new Error("hole patch needs 0 < d < pitch");
  const rowH = pitch * Math.sqrt(3) / 2;
  const nRowPairs = Math.max(1, Math.round((columns * pitch) / (2 * rowH)));
  const width = columns * pitch;
  const height = nRowPairs * 2 * rowH;
  const holes: [number, number][] = [];
  for (let r = 0; r < nRowPairs * 2; r++) {
    const y = (r + 0.5) * rowH;
    const shift = r % 2 === 0 ? 0.25 * pitch : 0.75 * pitch;
    for (let c = 0; c < columns; c++) holes.push([shift + c * pitch, y]);
  }
  const counted = holes.length * Math.PI * d * d / 4 / (width * height);
  return {
    holes, width, height, pitch, holeDiameter: d,
    countedOpenArea: counted, arrayOpenArea: openAreaOfPitch(d, pitch),
  };
}
