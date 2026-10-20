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
  tutorialSearch -- the Open Case dialog's search over EVERY tutorial
  (DEV.md 4c C113, Vítor's part 1).

  It reads `TUTORIALS`, the one index the folder browser reads, so a case
  the browser can open is a case the search can find and nothing else: no
  second catalogue.  The fields are the entry's own -- name, shortName,
  description, category, sub-class (its slug AND the label the browser shows
  it under) and the README -- matched by the rules in search/textSearch.ts.

  RANKING (Vítor's order: name > description > README).  Each term scores
  the BEST field it matched in -- the name 100, the description 20, the
  category / sub-class 10, the README 1 -- and a record's score is the sum
  over its terms, with a bonus when every term is in the name.  So a case
  whose name says "membrane" outranks one whose README mentions it, and two
  equal scores fall back to the name, alphabetically, so the order is stable.
\*---------------------------------------------------------------------------*/

import { fold, parseQuery, termMatches, type Term } from "../search/textSearch.js";
import { subclassLabel, type TutorialEntry } from "./tutorials.js";

/** Field weights, in Vítor's order. */
export const TUTORIAL_FIELD_WEIGHT = {
  name: 100,
  description: 20,
  folder: 10,
  readme: 1,
} as const;

export type TutorialField = keyof typeof TUTORIAL_FIELD_WEIGHT;

interface Hay { name: string; description: string; folder: string; readme: string }

// Folded once per entry, on first search -- the README is the bulk of it.
const HAY = new WeakMap<TutorialEntry, Hay>();

function hayOf(e: TutorialEntry): Hay {
  let h = HAY.get(e);
  if (!h) {
    h = {
      name: fold(`${e.name} ${e.shortName}`),
      description: fold(e.description ?? ""),
      folder: fold(`${e.category} ${e.subclass} ${subclassLabel(e.subclass)}`),
      readme: fold(e.readme ?? ""),
    };
    HAY.set(e, h);
  }
  return h;
}

export interface TutorialHit {
  entry: TutorialEntry;
  score: number;
  /** The best field each term matched in -- the strongest one is shown. */
  bestField: TutorialField;
}

/** Every tutorial that matches ALL the terms of `query`, best first.  A
 *  blank query returns nothing: the dialog then shows the folder browser. */
export function searchTutorials(
  query: string, entries: readonly TutorialEntry[],
): TutorialHit[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];
  const hits: TutorialHit[] = [];
  for (const e of entries) {
    const r = scoreEntry(terms, hayOf(e));
    if (r) hits.push({ entry: e, ...r });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return hits;
}

const FIELDS: readonly TutorialField[] = ["name", "description", "folder", "readme"];

function scoreEntry(
  terms: readonly Term[], hay: Hay,
): { score: number; bestField: TutorialField } | null {
  let score = 0;
  let bestField: TutorialField = "readme";
  let allInName = true;
  for (const t of terms) {
    const f = FIELDS.find((k) => termMatches(t, hay[k]));
    if (!f) return null;
    score += TUTORIAL_FIELD_WEIGHT[f];
    if (f !== "name") allInName = false;
    if (TUTORIAL_FIELD_WEIGHT[f] > TUTORIAL_FIELD_WEIGHT[bestField]) bestField = f;
  }
  if (allInName) score += 500;
  return { score, bestField };
}

/** What Enter in the search field opens: the HIGHLIGHTED result, or nothing.
 *  Never the folder browser's selection -- that may be the case that was
 *  already open when the dialog appeared, which is exactly the stale
 *  selection Vítor's brief rules out. */
export function searchEnterTarget(
  hits: readonly TutorialHit[], highlighted: number,
): string | null {
  if (hits.length === 0) return null;
  const i = Math.min(Math.max(highlighted, 0), hits.length - 1);
  return hits[i]!.entry.name;
}
