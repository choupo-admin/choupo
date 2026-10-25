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
  propsStudies -- THE SCIENTIFIC QUESTIONS A PROPS CASE DECLARES, AND WHAT
  KIND OF CHECK EACH IS (DEV.md 4c C154).

  A propsDict may declare `studies ( { name; title; purpose; summary; ops (
  ... ); } ... );` -- the questions it asks, in the order it tells them.  The
  ENGINE parses and refuses the declaration (src/postProcessing/views/
  Views.cpp: an unknown purpose, an operation the propsDict does not declare,
  one operation in two studies); this module only READS it for the screen:
  the About dialog lists the studies, the calculation map labels its frames
  with their titles, the Overview groups the run by them, and every
  operation's row says the purpose of the study it belongs to.

  THE PURPOSE IS WHAT THE STUDY SET OUT TO DO, NEVER WHAT THE RUN CONCLUDED.
  No word below says `validated`: a converged run of a code-to-code check is a
  converged run, and whether an answer survived evidence it never saw is the
  op's own curation verdict, a different column.  The vocabulary is the
  engine's (`studyPurposes()` in Views.cpp); tests/propsStudies.test.ts reads
  that list and holds this one to it, so the two cannot drift.
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";

export interface PurposeWords {
  /** a short label for a column or a badge */
  label: string;
  /** the sentence a reader is told: what kind of check this is, and what it
   *  does NOT say */
  sentence: string;
}

/** One entry per word `studyPurposes()` accepts, in its order. */
export const STUDY_PURPOSES: Readonly<Record<string, PurposeWords>> = {
  codeToCodeVerification: {
    label: "code-to-code verification",
    sentence: "One model, the same inputs, independent implementations: it says the "
      + "equations are solved right, not that the model is right.",
  },
  calibratedComparison: {
    label: "comparison with measurements, inputs calibrated on them",
    sentence: "Agreement with measurements whose model inputs were fitted to those same "
      + "measurements beforehand: it says the model, so calibrated, reproduces them, "
      + "not that it predicts.",
  },
  independentComparison: {
    label: "comparison with independent measurements",
    sentence: "Agreement with measurements the model's parameters never saw.",
  },
  numericalStudy: {
    label: "numerical study",
    sentence: "A discretisation, convergence or solver study: no number in it is a measurement.",
  },
  demonstration: {
    label: "demonstration",
    sentence: "The method shown on an example; nothing is compared with anything.",
  },
};

export interface Study {
  name: string;
  title: string;
  purpose: string;
  summary: string;
  ops: string[];
}

const isDict = (v: unknown): v is JsonDict => !!v && typeof v === "object" && !Array.isArray(v);

/** The propsDict's declared studies, in its order; an entry the engine would
 *  refuse (no name, no ops) is dropped here rather than half-drawn -- the run
 *  says why. */
export function declaredStudies(propsDict: JsonDict | null | undefined): Study[] {
  const list = propsDict?.["studies"];
  if (!Array.isArray(list)) return [];
  const out: Study[] = [];
  for (const s of list) {
    if (!isDict(s) || typeof s["name"] !== "string") continue;
    const ops = Array.isArray(s["ops"]) ? s["ops"].filter((o): o is string => typeof o === "string") : [];
    if (ops.length === 0) continue;
    out.push({
      name: s["name"],
      title: typeof s["title"] === "string" ? s["title"] : s["name"],
      purpose: typeof s["purpose"] === "string" ? s["purpose"] : "",
      summary: typeof s["summary"] === "string" ? s["summary"] : "",
      ops,
    });
  }
  return out;
}

/** op name -> the study it belongs to. */
export function studyOfOp(studies: readonly Study[]): Map<string, Study> {
  const m = new Map<string, Study>();
  for (const s of studies) for (const o of s.ops) if (!m.has(o)) m.set(o, s);
  return m;
}

/** The words for a purpose; an unknown word is shown as itself, never
 *  translated into a claim it does not make. */
export function purposeWords(purpose: string): PurposeWords {
  return STUDY_PURPOSES[purpose] ?? { label: purpose || "no purpose declared", sentence: "" };
}

/** The case's own story for the About dialog: the first `/* ... *\/` comment
 *  block of a dict that is NOT the Choupo banner (every shipped dict opens
 *  with the banner -- "C hemicals ... Licence", which said nothing about the
 *  case and was all the dialog showed until DEV.md 4c C154), stripped of its
 *  frame lines.  null when the dict has none worth showing. */
export function dictStory(raw: string | undefined): string | null {
  if (!raw) return null;
  const re = /\/\*([\s\S]*?)\*\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const inner = m[1]!;
    if (/C hemicals/.test(inner) || /SPDX-License-Identifier/.test(inner)) continue;
    const body = inner.split("\n")
      .filter((l) => !/^[\s\-\\*|]*$/.test(l))
      .join("\n").replace(/\s+$/, "");
    //  common left margin out, so the author's own indentation survives
    const lines = body.split("\n");
    const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
    const out = lines.map((l) => l.slice(Number.isFinite(pad) ? pad : 0)).join("\n");
    if (out.trim().length > 40) return out;
  }
  return null;
}
