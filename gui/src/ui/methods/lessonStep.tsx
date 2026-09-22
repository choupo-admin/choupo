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
  ONE numbered lesson step, and ONE place that draws it.

  WHY THIS FILE EXISTS.  Seventeen EduTools each carried their own copy of a
  nine-line step renderer, and sixteen lesson modules each declared their own
  identical `export interface LessonStep`.  Measured before this was written:
  the seventeen copies had already drifted into SEVEN distinct variants -- nine
  identical, two pairs, four one-offs -- which is what copy-paste does to a
  thing nobody owns.  The cost was not the duplication itself; it was that any
  change to how a step is PRESENTED cost seventeen edits, so no such change was
  ever made.

  WHAT THAT COST, concretely, and it is why this file exists NOW.  The owner
  read the tools and asked whether a student would know what the symbols in
  the equations mean.  Measured across the sixteen lesson modules: 133 symbol
  uses where the LETTER never appears outside a formula.  Some are harmless
  (Kremser writes `Y = y/(1−y)` and says in words what a mole ratio is, so the
  letter is bound even though a text search cannot see it); some are not
  (`ε ∂c_i/∂t + ρ_b ∂q_i/∂t` opens the breakthrough lesson, and the words
  "porosity" and "bulk density" appear nowhere in that file).  A student meets
  a Greek letter with nothing to attach it to.

  THE REMEDY IS A FIELD, NOT A PROSE PASS.  Definitions scattered through
  paragraphs are exactly the kind of thing that rots with nothing failing --
  this project's standing complaint about prose.  A structured `where` list is
  CHECKABLE: check_lesson_symbols asserts that every symbol appearing in a
  formula is glossed in that step or an earlier one.  What that gate cannot
  check, and says so about itself, is whether a definition is any GOOD.

  THE EQUATIONS ARE LaTeX (2026-09-22, Vitor's order: render them the way the
  guides do).  `formula`, every `derivation[].eq` and every `where[].sym` carry
  LaTeX and are drawn by KaTeX; `body`, `note`, `where[].means` and
  `where[].unit` are prose and are drawn as prose.

  THREE DECLARATIONS INSIDE AN EQUATION, and check_lesson_symbols reads the
  same three, which is why it no longer guesses:

    * `\text{...}` is PROSE -- an annotation beside the algebra, and a unit
      the page is not teaching (`[\text{kW/K}]`).  Nothing in it is a symbol.
    * `\ce{...}` is a SUBSTANCE (mhchem, which ships inside KaTeX).  `\ce{CO2}`
      is not a symbol a student is owed a definition of.
    * everything else IS a symbol, and a multi-letter one is upright:
      `\mathrm{VCF}`, `\mathrm{NTU}`, `\mathrm{LUB}`.  A unit the page
      deliberately teaches is written this way too and glossed -- the Van
      Heerden lesson does exactly that with the watt.

  So the notation says what each token is, and nothing has to be recognised by
  shape.  The old extractor's chemical-formula regex would have read
  `\mathrm{VCF}` as a substance; this one cannot.

  THE SYMBOL AND THE EQUATION SHARE ONE NOTATION, which is why `sym` is LaTeX
  too and is drawn as inline math.  Writing `\rho_b` in the equation and
  `rho_b` in the gloss beneath it shows a student one quantity in two
  typefaces, and it would force check_lesson_symbols to translate between two
  notations to compare them -- a second home for the notation inside the gate
  built to enforce single-sourcing.  One notation, one tokeniser, both sides.

  A FORMULA THAT DOES NOT PARSE IS DRAWN AS A FAILURE, never degraded: see
  lessonTex.ts for why `throwOnError: false` is the wrong shape here.
\*---------------------------------------------------------------------------*/

import { Box, Text, Title } from "@mantine/core";

import { renderTex } from "./lessonTex.js";

/** One symbol, bound to the words it stands for.
 *
 *  `sym` is LaTeX and is drawn as inline math, in the same notation as the
 *  equation above it.  `means` and `unit` are prose: a unit set in math italics
 *  reads as a product of variables, which is what "kg/kg dry solid" must not
 *  look like.
 *
 *  `unit` is optional because not every symbol has one -- a mole fraction, an
 *  effectiveness and a Lewis number are dimensionless, and writing "[-]"
 *  everywhere trains a reader to skip the column.  A symbol that DOES carry a
 *  unit should say so: half of what a student needs from a definition is
 *  which quantity it is, and the other half is what it is measured in. */
export interface SymbolGloss {
  sym: string;
  means: string;
  unit?: string;
}

export interface LessonStep {
  n: number;
  title: string;
  body: string;
  formula?: string;
  /** Every symbol the formula uses, in the order it uses them.  Omitted only
   *  where the step has no formula; a formula with unglossed symbols is a
   *  gate failure, waived by name in the debt registry while the debt lasts. */
  where?: readonly SymbolGloss[];
  /** HOW THE FORMULA WAS ARRIVED AT, one move per entry.
   *
   *  Added 2026-08-31 under the owner's ruling that EduTools replace the
   *  textbook (credo §10): a lesson that STATES `y = R/(R+1) x + x_D/(R+1)`
   *  has told a student what to plot and nothing about where it came from,
   *  and the first thing that equation stops being is memorable.
   *
   *  It lives on the SHARED step rather than on one page, because the
   *  ruling binds every construction and a field added to McCabe alone
   *  would be copied outward -- which is the drift this file was created to
   *  end (seventeen copies, seven variants, measured).
   *
   *  Each entry is a STATEMENT and the equation it produces.  Prose that
   *  merely restates the equation in words is not a derivation and should
   *  go in `body`; what belongs here is the balance being written, the
   *  substitution being made, or the assumption being spent. */
  derivation?: readonly { readonly step: string; readonly eq?: string }[];
  note?: string;
}

/** A limit: something the construction cannot show, named rather than implied. */
export interface LessonLimit { id: string; title: string; body: string; }

const BORDER = "var(--mantine-color-default-border)";
const FAIL = "var(--mantine-color-red-6)";

/** A piece of LaTeX, drawn -- or drawn as a FAILURE.
 *
 *  The failure branch is the whole reason this is a component rather than a
 *  one-line call.  KaTeX will happily paint unparsed source in red and carry
 *  on (`throwOnError: false`), which leaves a reader looking at a fragment of
 *  markup dressed as an equation and leaves nothing downstream able to tell.
 *  Here a formula that did not parse says so, names the parse error, and
 *  shows its own source so the page is repairable from what is on it.
 *
 *  `dangerouslySetInnerHTML` is KaTeX's only interface -- it renders to an
 *  HTML string.  The string comes from this repository's own lesson data
 *  through a parser that rejects anything it does not understand, never from
 *  a case file, a run result or anything a user supplies. */
function Tex(
  { src, mode }: { src: string; mode: "display" | "inline" },
): JSX.Element {
  const r = renderTex(src, mode);
  if (r.ok) {
    return (
      <Box component="span" display={mode === "display" ? "block" : "inline"}
        dangerouslySetInnerHTML={{ __html: r.html }} />
    );
  }
  return (
    <Box my={4} px="xs" py={4}
      style={{ border: `1px solid ${FAIL}`, borderRadius: 4 }}>
      <Text size="xs" c="red" fw={700}>
        this equation did not render — {r.message}
      </Text>
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
        {r.source}
      </Text>
    </Box>
  );
}

/** Draw one step.  Every EduTool calls THIS; none of them draws its own. */
export function LessonStepView({ step }: { step: LessonStep }): JSX.Element {
  return (
    <Box>
      <Title order={5}>{step.n} · {step.title}</Title>
      <Text size="sm" mt={4}>{step.body}</Text>
      {step.derivation && step.derivation.length > 0 && (
        <Box my={8} px="sm" py={8}
          style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>
            where it comes from
          </Text>
          {step.derivation.map((d, i) => (
            <Box key={i} mb={6}>
              <Text size="sm">
                <Text span c="dimmed" ff="monospace" size="xs">{i + 1}.</Text>
                {"  "}{d.step}
              </Text>
              {d.eq && (
                <Box mt={2} ml={16}><Tex src={d.eq} mode="display" /></Box>
              )}
            </Box>
          ))}
        </Box>
      )}
      {step.formula && (
        <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${BORDER}` }}>
          <Tex src={step.formula} mode="display" />
          {step.where && step.where.length > 0 && (
            <Box mt={8}>
              {step.where.map((g) => (
                <Text key={g.sym} size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>
                  <Tex src={g.sym} mode="inline" />
                  {"  "}{g.means}
                  {g.unit ? <Text span c="dimmed"> [{g.unit}]</Text> : null}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}
      {step.note && <Text size="sm" c="dimmed">{step.note}</Text>}
    </Box>
  );
}

/** The renderer every tool used to define for itself: find step `n` in the
 *  module's own list and draw it, or draw nothing if there is no such step.
 *  Returning null rather than throwing is deliberate -- a page that asks for
 *  a step it does not have should lose a paragraph, not the whole tool. */
export function lessonStepper(
  steps: readonly LessonStep[],
): (n: number) => JSX.Element | null {
  return (n: number) => {
    const st = steps.find((s) => s.n === n);
    return st ? <LessonStepView key={n} step={st} /> : null;
  };
}

/** The limits block, drawn the same way everywhere for the same reason. */
export function LessonLimits(
  { limits, title = "What this does not show" }:
  { limits: readonly LessonLimit[]; title?: string },
): JSX.Element {
  return (
    <Box>
      <Title order={5}>{title}</Title>
      <Box mt={6}>
        {limits.map((l) => (
          <Box key={l.id} mb={8}>
            <Text size="sm" fw={600}>{l.title}</Text>
            <Text size="sm" c="dimmed">{l.body}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
