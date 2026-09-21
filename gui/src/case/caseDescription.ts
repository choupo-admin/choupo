/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * caseDescription -- how much of `controlDict.description` a header shows.
 *
 * WHY THIS EXISTS.  Vítor opened the green-ammonia plant and said the
 * description at the top takes too much room.  The canvas's own comment
 * already agreed with him: it says the row exists "so an opened case answers
 * 'what is this?' IN ONE LINE".  That was the intent; the corpus then grew
 * descriptions into paragraphs and the row grew with them.  The flagship's
 * runs to ninety words and four lines, and every one of them pushes the
 * flowsheet down.
 *
 * TWO RULES OF THIS PROJECT SAY WHAT TO DO, and both were already written:
 *
 *   - the NO-REBLOAT invariant (gui-credo section 3, ratified 2026-06-24):
 *     a new control folds into a popover, "NEVER a new stacked row above the
 *     plot", and the plot's origin "is FIXED and must not move".  It was
 *     ratified for the Explorer; the flowsheet has the same surface and the
 *     same defect, and nobody carried the rule across.
 *   - D13 of the Explorer comb (2026-09-20): long captions overlaid on the
 *     data, whose resolution was that the caption is ONE SENTENCE and the
 *     paragraph moves elsewhere.
 *
 * So the header shows the LEAD and offers the rest; it does not truncate in
 * silence.  A reader must be able to see that there IS more -- a description
 * cut with no affordance is worse than a long one, because the reader cannot
 * know what was taken.
 *
 * PURE, and not for tidiness: vitest here runs `environment: "node"` with no
 * jsdom, so nothing in this repository renders a React component and any
 * decision left inside the canvas's `useMemo` is untestable.  The lead, the
 * "is there more" question and the sentence-splitting live here, where they
 * can be held to something.
 */

/** How long a lead may be before it stops being one line on a narrow window. */
export const LEAD_MAX_CHARS = 120;

export interface CaseDescription {
  /** the whole thing, trimmed; what the popover shows */
  full: string;
  /** the one-line lead the header shows */
  lead: string;
  /** true when `lead` is not the whole thing, so an affordance is required */
  hasMore: boolean;
}

/**
 * The first sentence, if there is one short enough to lead with.
 *
 * A Choupo description opens with a naming clause far more often than with a
 * full stop -- "Green ammonia, 500 t/day (Sines), with INDUSTRIAL-GRADE
 * nitrogen..." has no sentence end for ninety words -- so a sentence split
 * alone is not enough and the length cap is what actually does the work on
 * the corpus.  Both are here because a case that DOES open with a short
 * sentence should lead with exactly that sentence rather than a cut at 120
 * characters that lands mid-word.
 */
function firstSentence(text: string): string | null {
  //  A full stop that ends a sentence: followed by a space and a capital, or
  //  by the end of the text.  This deliberately does NOT try to understand
  //  abbreviations -- "500 t/day (Sines)" has no full stop, and a decimal
  //  point is never followed by a space and a capital.
  const m = /^(.+?[.!?])(\s+[A-Z(]|$)/.exec(text);
  if (!m) return null;
  const s = m[1]!.trim();
  return s.length > 0 && s.length <= LEAD_MAX_CHARS ? s : null;
}

/** Cut at a word boundary, never mid-word, and mark the cut. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  //  A "word" longer than the whole budget (a URL, a pathological name) has
  //  no boundary to fall back on; cutting it hard beats returning nothing.
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

/**
 * Split a raw `controlDict.description` into what a header shows and what a
 * popover holds.  Returns null when there is nothing to show -- which is a
 * fact, not a failure: the caller draws no header at all rather than an
 * empty strip.
 */
export function caseDescription(raw: unknown): CaseDescription | null {
  if (typeof raw !== "string") return null;
  //  Dict values arrive with their newlines and runs of spaces intact; a
  //  header is one line, so whitespace collapses here rather than in a
  //  style rule that only LOOKS like it collapsed (the text would still be
  //  copied out with its line breaks).
  const full = raw.replace(/\s+/g, " ").trim();
  if (full.length === 0) return null;

  const sentence = firstSentence(full);
  const lead = sentence ?? clip(full, LEAD_MAX_CHARS);
  return { full, lead, hasMore: lead !== full };
}
