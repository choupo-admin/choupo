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
  exploreHonesty -- WHAT THE CURATED-PAIR CATALOGUE MEANS FOR THIS SELECTION.

  One fact, three readers, and all three were wrong in different ways:

  * THE DEFAULT MODEL.  The workspace's honest-default effect opened
    `if (selected.length !== 2) return;`, so three organics booted the ternary
    lens on NRTL and the ENGINE refused by name ("2 binary pair(s) have no
    parameters ... REFUSED") -- although all three carry UNIFAC groups and the
    same effect saves every binary.  A guard written for the binary case
    silently excluded every other one.

  * THE FOOTER NOTE said "absent -> ideal".  It has not been true since the
    problem-divergence ruling of 2026-08-11: an unauthorised substitution is
    REFUSED, not applied.  Three sentences on that screen described an engine
    that no longer exists, and the student was told the diagram would be drawn
    ideally when in fact nothing would be drawn at all.

  * THE GREEN TICK.  `NRTL ✓` was printed for any pair the catalogue names,
    and data/standards/parameters/NRTL/benzene-toluene.dat carries `origin
    assumed;` beside four NULL energies -- the record IS the ideality
    assumption.  A student read "curated non-ideal pair" and saw two lines flat
    at exactly 1.000.

  THE SPLIT THAT KEEPS THEM STRAIGHT, and it is the durable half: the DEFAULT
  asks what the ENGINE WILL DO (a record exists, or the run refuses), the NOTE
  asks what the ANSWER MEANS (that record may be an assumption).  An `assumed`
  pair is PRESENT -- the engine runs it -- so it must not flip the default; and
  it is not curated non-ideality -- so it must not draw a tick.  Reading both
  off one question is how a tick ended up on an ideal line.

  Pure (no React) so all three are unit-tested directly.
\*---------------------------------------------------------------------------*/

import { pairEntry, type PairEntry } from "./pairsCatalogue.js";

/** The fitted-pair activity models: the ones that NEED a curated binary pair
 *  and whose absence the engine refuses.  `ideal` needs none; `UNIFAC` is
 *  predictive and answers a different question (group coverage). */
export const FITTED_PAIR_MODELS = ["NRTL", "Wilson", "UNIQUAC"] as const;

export function isFittedPairModel(model: string): boolean {
  return (FITTED_PAIR_MODELS as readonly string[]).includes(model);
}

export type PairStatus =
  /** a record exists and claims to describe measured non-ideality */
  | "curated"
  /** a record exists and declares itself an ASSUMPTION (`origin assumed`) */
  | "assumed"
  /** no record: the engine refuses the model for this selection */
  | "absent";

export interface PairCoverage {
  a: string;
  b: string;
  status: PairStatus;
  /** the record's own origin word, "" when absent or undeclared */
  origin: string;
}

/** Look a pair up in the shipped catalogue.  Injectable so a test can put a
 *  record in front of the rules without inventing one in data/standards/. */
export type PairLookup = (model: string, a: string, b: string) => PairEntry | undefined;

/** Every unordered pair of a selection, in selection order.
 *  The workspace enumerated them with a hand-written `if (length === 2) ...
 *  else if (length === 3) ...`, which is why a fourth component silently
 *  produced NO note at all. */
export function allPairs(sel: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < sel.length; i++)
    for (let j = i + 1; j < sel.length; j++) out.push([sel[i]!, sel[j]!]);
  return out;
}

/** What the catalogue holds for every pair of the selection. */
export function pairCoverage(model: string, sel: string[],
                             lookup: PairLookup = pairEntry): PairCoverage[] {
  return allPairs(sel).map(([a, b]) => {
    const rec = lookup(model, a, b);
    if (!rec) return { a, b, status: "absent" as const, origin: "" };
    const origin = rec.origin ?? "";
    return { a, b, status: origin === "assumed" ? "assumed" as const : "curated" as const, origin };
  });
}

/** The pairs the engine has NO record for -- the ones it will name in its
 *  refusal.  ("assumed" is not one of them: that record exists and runs.) */
export function missingPairs(model: string, sel: string[],
                             lookup: PairLookup = pairEntry): [string, string][] {
  return pairCoverage(model, sel, lookup)
    .filter((p) => p.status === "absent")
    .map((p) => [p.a, p.b] as [string, string]);
}

/** THE DEFAULT MODEL for a freshly-chosen selection.
 *
 *  A fitted-pair model with a pair the catalogue does not hold is a run the
 *  engine REFUSES, so booting on it hands the student a red banner for a
 *  choice they never made.  Where every component carries UNIFAC groups there
 *  is a predictive model that needs no pair, and that is the honest default.
 *  Fires on the COVERAGE, at ANY selection size -- the rule it replaces was
 *  written for a binary and returned early for everything else.
 *
 *  Returns the model to use; `prev` unchanged when nothing is wrong with it
 *  (so a manual pick of NRTL for a covered pair is respected). */
export function defaultActivityFor(prev: string, sel: string[],
                                   unifacAble: (c: string) => boolean,
                                   lookup: PairLookup = pairEntry): string {
  if (sel.length < 2) return prev;
  if (!isFittedPairModel(prev)) return prev;
  if (missingPairs(prev, sel, lookup).length === 0) return prev;   // engine will run it
  if (!sel.every(unifacAble)) return prev;        // no predictive fallback to offer
  return "UNIFAC";
}

const dash = (a: string, b: string) => `${a}–${b}`;

/** The footer's per-pair note: WHAT BACKS the chosen model, pair by pair. */
export function pairNoteText(model: string, sel: string[],
                             lookup: PairLookup = pairEntry): string | null {
  if (!isFittedPairModel(model)) return null;
  const cov = pairCoverage(model, sel, lookup);
  if (cov.length === 0) return null;
  const parts = cov.map((p) => {
    if (p.status === "absent")
      return `${dash(p.a, p.b)}: no ${model} pair — the engine REFUSES this model`;
    if (p.status === "assumed")
      return `${dash(p.a, p.b)}: ${model} record, origin "assumed" — null coefficients, `
        + `i.e. the IDEALITY assumption (γ = 1), not measured non-ideality`;
    return `${dash(p.a, p.b)}: ${model} ✓`;
  });
  return `pairs — ${parts.join("  ·  ")}`;
}

/** The alert raised when the chosen model has a pair the catalogue lacks.
 *
 *  It used to say the diagram "assumes IDEAL mixing".  The engine has not done
 *  that since 2026-08-11: it refuses, names the pairs, and lists the four
 *  legitimate paths.  The alert says what will happen and names the same
 *  paths, in the engine's own order. */
export function modelRefusalWarning(model: string, sel: string[],
                                    unifacAble: (c: string) => boolean,
                                    lookup: PairLookup = pairEntry): string | null {
  if (!isFittedPairModel(model)) return null;
  const missing = missingPairs(model, sel, lookup);
  if (missing.length === 0) return null;
  const named = missing.map(([a, b]) => dash(a, b)).join(", ");
  const unifacOk = sel.every(unifacAble);
  return `No curated ${model} pair for ${named}. The engine REFUSES this model rather than `
    + `running those pairs as ideal — the problem solved would not be the problem posed. `
    + (unifacOk
        ? `Switch γ to UNIFAC (predictive, from the components' own groups), `
        : `No predictive fallback here either: not every component carries UNIFAC groups. `)
    + `curate the pair${missing.length > 1 ? "s" : ""}, or authorise the approximation in an `
    + `authored case (approximations { idealBinaryPair { pairs ( … ); reason "…"; } }).`;
}

/** The FIRST line of a run log that names a refusal.
 *
 *  The workspace reversed the log and took the LAST line matching
 *  error|fatal|refused|failed, which on every engine refusal is the
 *  EXPLANATION ("That is a DIFFERENT MODEL from the one requested...") rather
 *  than the headline that names the subject ("... 2 binary pair(s) have no
 *  parameters ...: benzene-nHexane, toluene-nHexane").  A refusal's headline
 *  comes FIRST and its remedies come after; so does the sentence a student
 *  needs.  Falls back to the old rule only when no headline is found, so a
 *  log shape nobody anticipated still says something. */
export function failureHeadline(log: string): string | undefined {
  const lines = log.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const headline = lines.find((l) => /(?:fatal error|REFUSED)/.test(l));
  if (headline) return headline;
  return lines.reverse().find((l) => /(?:error|fatal|refused|failed)/i.test(l));
}
