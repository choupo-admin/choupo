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
  textSearch -- the ONE home of how the GUI matches what a reader typed
  against prose (DEV.md 4c C113).

  Two searches use it: the Open Case dialog over every tutorial, and the
  EduTools Find over every lesson.  They rank different things, so each has
  its own ranking module; what they must NOT have is two ideas of what "the
  word matches" means, or a student would find "destilação" in one and not in
  the other.

  THE RULES, each a sentence a reader can check:
    * case and accents do not matter: both sides are FOLDED -- Unicode NFD,
      every combining mark dropped, lower-cased -- so "Osmose", "osmose" and
      "ósmose" are one word;
    * several words are several TERMS, in any order, and EVERY term must
      match somewhere in the record (an AND, never an OR: "reverse osmosis"
      that matched every page mentioning "reverse" would be noise);
    * a term of one or two letters matches only at the START of a word, so
      "RO" finds "RO" and "rotating" and not "process" -- a two-letter
      substring is in half the corpus;
    * an ABBREVIATION is a term too.  The tutorials write "RO" and "NF" and
      never spell them out (measured 2026-10-20: no README, description or
      controlDict in tutorials/ contains the word "osmosis"), so a reader who
      types the phrase would find nothing.  `ABBREVIATIONS` below is the small
      declared bridge: a phrase (English, and the Portuguese a student at IST
      types) matches its abbreviation as a WHOLE word, and an abbreviation
      typed alone also matches its phrases.  It is a vocabulary, not a
      catalogue -- it names no tutorial and no tool.

  No library, no index server: the corpus is a few hundred records and a
  substring scan over pre-folded text answers in milliseconds.
\*---------------------------------------------------------------------------*/

/** Fold one string: NFD, drop combining marks, lower-case. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/** A string folded WITH a map back to the original, so an excerpt can be cut
 *  from the text the reader will see (folding changes lengths: "ç" is two
 *  code units after NFD and one after the mark is dropped). */
export interface Folded {
  text: string;
  /** `orig[i]` = index in the original of folded code unit `i`. */
  orig: number[];
}

export function foldWithMap(s: string): Folded {
  let text = "";
  const orig: number[] = [];
  let i = 0;
  for (const ch of s) {               // iterates code POINTS
    const f = ch.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
    for (let k = 0; k < f.length; k++) orig.push(i);
    text += f;
    i += ch.length;
  }
  return { text, orig };
}

/** One way a term can match: a folded string, either anywhere or only at a
 *  word start (`atWordStart`), or only as a whole word (`whole`). */
export interface Alternative {
  text: string;
  atWordStart?: boolean;
  whole?: boolean;
}

/** One term of a query: it matches when ANY of its alternatives matches. */
export interface Term {
  /** What the reader typed for it (folded), for display. */
  label: string;
  alts: Alternative[];
}

/** The declared abbreviation bridge (see the file header).  Each phrase is
 *  matched as typed (folded); the abbreviation only as a whole word. */
export const ABBREVIATIONS: readonly { abbr: string; phrases: readonly string[] }[] = [
  { abbr: "ro", phrases: ["reverse osmosis", "osmose inversa", "osmose reversa"] },
  { abbr: "nf", phrases: ["nanofiltration", "nanofiltracao"] },
  { abbr: "uf", phrases: ["ultrafiltration", "ultrafiltracao"] },
  { abbr: "ed", phrases: ["electrodialysis", "eletrodialise", "electrodialise"] },
];

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && WORD_CHAR.test(c);
}

/** Where `alt` first matches in folded `hay`, or -1. */
export function altIndex(alt: Alternative, hay: string): number {
  if (!alt.text) return -1;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(alt.text, from);
    if (i < 0) return -1;
    const startOk = !(alt.atWordStart || alt.whole) || !isWordChar(hay[i - 1]);
    const endOk = !alt.whole || !isWordChar(hay[i + alt.text.length]);
    if (startOk && endOk) return i;
    from = i + 1;
  }
}

/** First match of a term in folded `hay`: its index and length, or null. */
export function termHit(term: Term, hay: string): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const a of term.alts) {
    const i = altIndex(a, hay);
    if (i >= 0 && (!best || i < best.index)) best = { index: i, length: a.text.length };
  }
  return best;
}

export function termMatches(term: Term, hay: string): boolean {
  return termHit(term, hay) !== null;
}

/** Split what the reader typed into terms (see the file header for the
 *  rules).  An empty or blank query gives no terms -- and no terms means
 *  "no search", never "everything matches". */
export function parseQuery(query: string): Term[] {
  let q = ` ${fold(query).replace(/\s+/g, " ").trim()} `;
  if (q.trim() === "") return [];
  const terms: Term[] = [];
  // Phrases first, longest first, so "reverse osmosis" is one term and not
  // the two words "reverse" and "osmosis".
  const phraseRows = ABBREVIATIONS.flatMap((row) =>
    row.phrases.map((p) => ({ row, p: fold(p) })))
    .sort((a, b) => b.p.length - a.p.length);
  for (const { row, p } of phraseRows) {
    const needle = ` ${p} `;
    while (q.includes(needle)) {
      q = q.replace(needle, " ");
      terms.push({ label: p, alts: alternativesOf(row) });
    }
  }
  for (const w of q.trim().split(" ")) {
    if (!w) continue;
    const row = ABBREVIATIONS.find((r) => r.abbr === w);
    if (row) { terms.push({ label: w, alts: alternativesOf(row) }); continue; }
    terms.push({ label: w, alts: [{ text: w, atWordStart: w.length <= 2 }] });
  }
  return terms;
}

function alternativesOf(row: { abbr: string; phrases: readonly string[] }): Alternative[] {
  return [
    { text: row.abbr, whole: true },
    ...row.phrases.map((p) => ({ text: fold(p) })),
  ];
}

/** Does EVERY term match somewhere in at least one of the folded fields? */
export function allTermsMatch(terms: readonly Term[], fields: readonly string[]): boolean {
  return terms.every((t) => fields.some((f) => termMatches(t, f)));
}

/** An excerpt of `original` around the first hit of any term, cut on the
 *  ORIGINAL text so the reader sees accents and capitals as written.  Null
 *  when no term matches. */
export function excerptAround(
  original: string, terms: readonly Term[], radius = 70,
): { before: string; hit: string; after: string } | null {
  const f = foldWithMap(original);
  let best: { index: number; length: number } | null = null;
  for (const t of terms) {
    const h = termHit(t, f.text);
    if (h && (!best || h.index < best.index)) best = h;
  }
  if (!best) return null;
  const s = f.orig[best.index] ?? 0;
  const lastFolded = best.index + best.length - 1;
  const eIncl = f.orig[lastFolded] ?? s;
  // The end is one past the original character the last folded unit came from.
  let e = eIncl + 1;
  while (e < original.length && /\p{M}/u.test(original[e]!)) e++;
  if (e < original.length && /[\uDC00-\uDFFF]/.test(original[e]!)) e++;
  let a = Math.max(0, s - radius);
  let b = Math.min(original.length, e + radius);
  // Prefer to start and end on a space so the excerpt does not cut a word.
  if (a > 0) { const sp = original.indexOf(" ", a); if (sp >= 0 && sp < s) a = sp + 1; }
  if (b < original.length) { const sp = original.lastIndexOf(" ", b); if (sp > e) b = sp; }
  const squash = (x: string) => x.replace(/\s+/g, " ");
  return {
    before: (a > 0 ? "… " : "") + squash(original.slice(a, s)),
    hit: squash(original.slice(s, e)),
    after: squash(original.slice(e, b)) + (b < original.length ? " …" : ""),
  };
}
