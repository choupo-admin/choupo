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

/*  THE INSTANT DIRECTORIES IN THE CASE TREE (backlog C482, part 1).
 *
 *  A time-integrated run (choupoBatch / choupoCtrl / choupoSemiContinuous)
 *  writes `<t>/` directories at the case root.  The worker harvests them on
 *  the `instantTreeFiles` channel, CAPPED, and the Case tab merges them
 *  read-only beside the authored files.  This file holds the pure parts:
 *  the cap, the numeric order, the merge, the one-line account.  The worker
 *  is plain JS and cannot import this, so `pickInstants` is MIRRORED there
 *  and tests/instantTree.test.ts evaluates the worker's copy against this
 *  one.  */

/** The most instant directories the tree carries.  200: a tree a student
 *  scrolls, a message of a few MB at most on the largest shipped cases
 *  (measured; see the backlog), and above what any plot of the trajectory
 *  resolves. */
export const TREE_MAX_INSTANTS = 200;

/** Evenly spread by index, first and last always kept.  `dirs` must already
 *  be in time order. */
export function pickInstants<T>(dirs: readonly T[], max: number = TREE_MAX_INSTANTS): T[] {
  const n = dirs.length;
  if (n <= max) return dirs.slice();
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(dirs[Math.round(k * (n - 1) / (max - 1))]!);
  return out;
}

/** Numeric order of two instant names ("1e-06" < "0.001" < "10" < "100"). */
export const compareInstants = (a: string, b: string): number =>
  parseFloat(a) - parseFloat(b);

/** A directory name that is a time: a plain number or one in exponent form,
 *  never `0` (the authored state, which a run does not replace). */
export const isInstantName = (seg: string): boolean =>
  /^(\d+(\.\d+)?|\d(\.\d+)?[eE][-+]?\d+)$/.test(seg) && seg !== "0";

/** The tree's raw map for DISPLAY: the harvested trees and the instants
 *  under the authored files.  Never written into caseFiles.  The authored
 *  keys are applied LAST, so a harvested file can never shadow `0/` or any
 *  authored file. */
export function mergeInstantTree(
  authored: { [p: string]: string },
  others: ReadonlyArray<{ [p: string]: string } | undefined>,
  tree: { files: { [p: string]: string } } | undefined,
): { [p: string]: string } {
  const instants: { [p: string]: string } = {};
  for (const [k, v] of Object.entries(tree?.files ?? {})) {
    const top = k.split("/")[0] ?? "";
    if (k === "trajectory.csv" || (k.includes("/") && isInstantName(top))) instants[k] = v;
  }
  return Object.assign({}, instants, ...others.map((o) => o ?? {}), authored);
}

/** The line the tree says about the cap; "" when there is nothing to say. */
export function instantAccount(tree: { written: number; shown: number } | undefined): string {
  if (!tree || tree.written === 0) return "";
  return tree.shown < tree.written
    ? `${tree.shown} of ${tree.written} instants shown (first and last kept, the rest evenly spread)`
    : `${tree.written} instants written, all shown`;
}
