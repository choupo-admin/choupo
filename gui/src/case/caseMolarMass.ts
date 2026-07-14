/*---------------------------------------------------------------------------*\
  Component molar masses parsed straight from the case's own component files
  (`constant/components/<c>.dat`, or a sealed `constant/propertyData/.../<c>.dat`),
  each carrying an `MW <value>;` line.  This gives the display a molar-mass map
  BEFORE any run -- so a mass-basis flow (kg/h) and the √(mass-flow) wire width
  can be shown from the 0/ molar state, computed from KNOWN molecular weights
  rather than left blank until the solver emits `componentMolarMass`.  Honest:
  the MW is the curated datum, not a fabricated number.

  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/
const MW_RE = /^\s*MW\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*;/m;
const NAME_RE = /(?:^|\/)components\/([^/]+)\.dat$/;

/** Parse `{ component: MW[kg/kmol] }` from every component `.dat` in rawFiles
 *  (`constant/components/<c>.dat` or a sealed `constant/propertyData/.../<c>.dat`).
 *  Empty when the case ships no component files. */
export function caseMolarMass(raw: { [p: string]: string } | undefined): { [c: string]: number } {
  const out: { [c: string]: number } = {};
  if (!raw) return out;
  for (const [path, body] of Object.entries(raw)) {
    const nm = path.match(NAME_RE);
    if (!nm) continue;
    const mw = body.match(MW_RE);
    if (mw) {
      const v = Number(mw[1]);
      if (Number.isFinite(v) && v > 0) out[nm[1]!] = v;
    }
  }
  return out;
}

/** Mean molar mass [kg/kmol] of a mole-fraction composition, or 0 when no
 *  component's MW is known (caller then leaves the mass flow undefined). */
export function meanMolarMass(
  composition: { [c: string]: number } | undefined,
  mws: { [c: string]: number },
): number {
  if (!composition) return 0;
  let sum = 0;
  let covered = 0;
  for (const [c, x] of Object.entries(composition)) {
    const mw = mws[c];
    if (mw !== undefined) { sum += x * mw; covered += x; }
  }
  // Require the composition to be (essentially) fully covered -- a partial MW
  // map would under-count the mass and mislead; better to show molar honestly.
  return covered > 0.999 ? sum : 0;
}
