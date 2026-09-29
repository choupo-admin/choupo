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
  ONE home for turning a lesson's LaTeX into the markup a browser draws.

  WHY LaTeX AT ALL.  Every EduTool equation used to be monospace text --
  `Y_sat(T_wb) - Y = (cp_c + Y*cp_v)(T_air - T_wb) / lambda(T_wb)` -- which is
  a transcription of an equation rather than the equation.  A student who has
  just read the same relation in the Theory Guide, set properly, meets it here
  in a form they have to decode.  The guides already write these in LaTeX, so
  LaTeX is the notation the project already owns.

  WHY THERE IS NO SECOND FIELD.  A `formulaTex` beside `formula` would be the
  same equation in two homes, and the two would drift the first time anyone
  edited one of them.  `formula` IS the LaTeX; there is nothing else to keep
  in step.  `check_lesson_symbols` reads the same LaTeX, so the gate and the
  page cannot disagree about what the equation says either.

  WHY A PARSE FAILURE IS LOUD.  KaTeX offers `throwOnError: false`, which
  paints the unparsed source in red and carries on.  That is the wrong shape
  for this project twice over: it degrades silently in the sense that nothing
  downstream can tell, and the reader is shown a fragment of source dressed as
  an equation.  This module THROWS inside KaTeX, catches, and returns a
  FAILURE the caller must render as one -- with the source visible, so the
  broken equation is obvious on the page and reparable from what is shown.

  NODE-SAFE ON PURPOSE.  This module imports no CSS and no React, so vitest
  (environment: "node") can parse every shipped formula without a DOM.  The
  stylesheet is imported once in main.tsx, beside Mantine's; the fonts travel
  with it through Vite's asset pipeline and are never fetched from a CDN --
  the app has to work with no network at all.
\*---------------------------------------------------------------------------*/

import katex from "katex";
//  Imported for its SIDE EFFECT only: mhchem exports nothing, it registers
//  \ce{} on the katex instance above.
import "katex/contrib/mhchem";

//  mhchem registers \ce{} on the katex instance it is handed.  It ships
//  INSIDE the katex package under the same MIT licence, so it is not a new
//  dependency -- and it is what makes a chemical species DECLARED rather than
//  guessed: `\ce{HCO3-}` is a substance, every other token is a symbol a
//  reader is owed a definition of.  check_lesson_symbols reads that same
//  distinction, which is how the old "matched by shape, occasionally wrong in
//  both directions" filter was retired.
//
//  katex's own typings cover its main entry only, so the contrib path is
//  declared locally in vite-env.d.ts.

/** What a render attempt produced.  A failure carries the source BECAUSE the
 *  caller has to show it: an equation that did not parse must be visible as
 *  one, never quietly absent and never a red fragment pretending to be an
 *  equation. */
export type TexRender =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly message: string; readonly source: string };

/*  `strict: "error"` IS PART OF THE NO-SILENT-DEGRADATION RULE, not pedantry.
 *
 *  Measured on the day this was chosen: of the characters the old monospace
 *  formulas used, KaTeX's strict mode rejects exactly four -- a bare Unicode
 *  root sign, a vulgar fraction, an em dash inside \text{}, and an accented
 *  letter used as a symbol in math mode.  Those are precisely the ones it has
 *  no glyph for or no unambiguous reading of, and under the looser settings
 *  each renders as a blank or a guess with nothing said.  Greek letters,
 *  arrows, relations and the Unicode minus it maps correctly, and those it
 *  still accepts.  So the strict setting costs the notation nothing it should
 *  have been using and refuses the four things that would ship broken.
 *
 *  A displayed equation is LEFT-aligned, not centred.
 *
 *  `fleqn` is the reason this option set exists as a named constant: the
 *  lesson step draws its formula in a bordered block whose prose is
 *  left-aligned, and a centred equation inside it reads as a different
 *  element on the page.  The guides set their displayed equations flush left
 *  for the same reason. */
const DISPLAY_OPTIONS = {
  displayMode: true,
  fleqn: true,
  throwOnError: true,
  strict: "error" as const,
  output: "htmlAndMathml" as const,
};

const INLINE_OPTIONS = {
  displayMode: false,
  throwOnError: true,
  strict: "error" as const,
  output: "htmlAndMathml" as const,
};

/** Render one piece of LaTeX, or report why it could not be rendered.
 *
 *  `mode` is "display" for an equation that owns its own line (a step's
 *  `formula`, a derivation's `eq`) and "inline" for a symbol drawn in a line
 *  of text (a `where` entry's `sym`). */
export function renderTex(source: string, mode: "display" | "inline"): TexRender {
  const src = source.trim();
  if (src === "") {
    return { ok: false, message: "empty formula", source };
  }
  try {
    return {
      ok: true,
      html: katex.renderToString(
        src, mode === "display" ? DISPLAY_OPTIONS : INLINE_OPTIONS),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      source: src,
    };
  }
}

/** True when this LaTeX parses.  The whole point of exporting it separately
 *  is the test over the shipped corpus: every `formula`, every derivation
 *  `eq` and every `where` symbol in every lesson module is fed through this,
 *  in node, with no DOM -- so a formula that would paint a failure box in the
 *  browser fails the suite instead of reaching a student. */
export function texParses(source: string): boolean {
  return renderTex(source, "display").ok;
}

/** A line of TEXT with inline math in it, split into its pieces.
 *
 *  Knob labels and their tooltips are one-line prose that names variables --
 *  "critical moisture X_c" -- and a variable in running text is owed the same
 *  notation the lesson's equations give it.  The delimiter is LaTeX's own
 *  inline pair `\(` ... `\)`, NOT `$` ... `$`: a knob label may legitimately
 *  carry a currency sign ("price ($/kg)"), and a dollar pair would read it
 *  as math.
 *
 *  An opening `\(` with no closing `\)` is returned as a math piece running
 *  to the end, so the caller renders it through KaTeX and the reader sees a
 *  failure (or a visibly wrong label) rather than a delimiter silently
 *  swallowed; the test over the shipped labels refuses it before that. */
export interface InlinePiece {
  readonly math: boolean;
  readonly s: string;
}

export function splitInlineTex(text: string): InlinePiece[] {
  const out: InlinePiece[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("\\(", i);
    if (open < 0) {
      out.push({ math: false, s: text.slice(i) });
      break;
    }
    if (open > i) out.push({ math: false, s: text.slice(i, open) });
    const close = text.indexOf("\\)", open + 2);
    if (close < 0) {
      out.push({ math: true, s: text.slice(open + 2) });
      break;
    }
    out.push({ math: true, s: text.slice(open + 2, close) });
    i = close + 2;
  }
  return out;
}

/** True when every inline-math piece of `text` is closed AND parses. */
export function inlineTexParses(text: string): boolean {
  let depth = 0;
  for (let k = 0; k + 1 < text.length; ++k) {
    if (text[k] === "\\" && text[k + 1] === "(") { if (depth++) return false; ++k; }
    else if (text[k] === "\\" && text[k + 1] === ")") { if (!depth--) return false; ++k; }
  }
  if (depth !== 0) return false;
  return splitInlineTex(text).every(
    (p) => !p.math || renderTex(p.s, "inline").ok);
}
