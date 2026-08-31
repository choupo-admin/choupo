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
  THE NUMBER NOBODY CHECKED -- the first page on the Economics & management
  shelf, opened on the owner's suggestion (2026-08-31) that engineers are
  taught to compute a capital cost and never taught what happens around one.

  THE FRAMING WAS DELIBERATELY CHANGED, and the reason belongs here because
  it governs every future page on this shelf.  The suggestion arrived
  attached to a guess about students' temperament.  Written that way the
  material becomes advice for people presumed deficient, which is
  condescending, unfounded, and -- the part that matters technically --
  produces a worse page.  The gap this shelf addresses is CURRICULAR, not
  personal: five years of balances and not one hour on the fact that the
  large industrial accidents had organisational root causes.  That is true
  of everyone in the room, which is why the pages are written for everyone.

  IT IS BUILT ON A REAL ARTEFACT OF THIS REPOSITORY, not a case study from
  a textbook: ammonia02_full_plant publishes an NPV of EUR 196 512 120.366
  discounted over a ONE-year construction while its own postDict declares
  `constructionPeriod 2`.  Verified again the day this page was written --
  the declaration, the golden and the engine's handling all re-read, because
  a page built on a stale finding is the failure it is about.

  ZERO PHYSICS, AND ZERO ARITHMETIC, IN TYPESCRIPT: every figure below is
  quoted from a golden or a source file, with where to find it.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Stack, Text, Title } from "@mantine/core";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** Quoted, never computed.  Each is re-verifiable in one grep. */
export const NPV_FACTS = {
  case_: "tutorials/steady/flowsheets/ammonia02_full_plant",
  npv: "196 512 120.366",
  irr: "0.461115150452",
  payback: "2.56423680412",
  declaredConstruction: 2,
  modelledConstruction: 1,
  projectLife: 15,
  discountRate: 0.10,
} as const;

export const NNC_STEPS = [
  {
    n: 1,
    title: "Start with the number, and read what it claims",
    body: `A plant case in this corpus reports a net present value of `
      + `EUR ${NPV_FACTS.npv}, an IRR of ${NPV_FACTS.irr} and a payback of `
      + `${NPV_FACTS.payback} years.  Before asking whether it is right, ask `
      + `what its FORM asserts.  It is pinned to the milli-euro and the IRR `
      + `to twelve digits.  Those digits are real in exactly one sense — `
      + `they are what the arithmetic produced, and pinning them is how a `
      + `regression suite notices the answer moving.  They are not, and `
      + `never were, a statement about how well the value is known.  This `
      + `is the same distinction the temperature page makes about a `
      + `thermometer reading six digits: resolution is not uncertainty.`,
  },
  {
    n: 2,
    title: "Walk it backwards, and notice how many people it passes through",
    body: "An NPV is the end of a chain, and every link is somebody's "
      + "judgement.  Discounted cash flows come from revenues and operating "
      + "costs; those come from the capital cost; that comes from equipment "
      + "SIZES; those come from the simulation; and the simulation rests on "
      + "a thermophysical package somebody selected and parameters somebody "
      + "curated.  A jury at a viva does not attack the last step.  They "
      + "pick a link and ask who chose it.",
    note: "This is why the costing table in Choupo prints its own "
      + "arithmetic — correlation, coefficients, size driver, CEPCI ratio, "
      + "currency, the installation factors and the source.  A provenance "
      + "line too coarse to reproduce is worse than none: a reader who "
      + "redoes it and lands 2.6 % out concludes THEY made the mistake.",
  },
  {
    n: 3,
    title: "The link that does not hold",
    body: `The case's own economics block declares `
      + `\`constructionPeriod ${NPV_FACTS.declaredConstruction};\` beside a `
      + `${NPV_FACTS.projectLife}-year project life and a `
      + `${NPV_FACTS.discountRate * 100} % discount rate.  The cash-flow `
      + `timeline models a ONE-year construction: the whole fixed capital `
      + `investment and working capital are placed at t = 0 and operating `
      + `cash flows begin in year 1.  So the published NPV does not match `
      + `the case's own declaration — not because anyone wrote a wrong `
      + `number, but because a declared input was read by nothing.`,
    note: "The author wrote 2 and believed they had said something.  The "
      + "engine had never been taught the word.  Between those two facts "
      + "sits a number that went into a shipped tutorial and would have "
      + "gone into a report.",
  },
  {
    n: 4,
    title: "How it was found — and it was not by reading carefully",
    body: "Nobody spotted this by looking.  It surfaced when a machine was "
      + "asked a question nobody had asked before: WHICH DECLARED KEYS DID "
      + "NOTHING READ?  Under that question the discrepancy is not subtle; "
      + "it is a one-line report.  The general lesson is worth more than "
      + "this instance: the errors that survive review are the ones review "
      + "is not shaped to see, and the remedy is usually a new QUESTION "
      + "rather than more diligence with the old one.",
    note: "The same pass, run over every case that carries such a file, "
      + "found five more declaring solver bounds beside a solver that never "
      + "uses them — dead configuration reading as a live setting.",
  },
  {
    n: 5,
    title: "What the engine does about it, and why NOT fixing it is the right call",
    body: "This is the step worth taking into your first job.  Three "
      + "responses were available: refuse to run; implement a real "
      + "multi-year draw-down; or announce.  It ANNOUNCES — stating beside "
      + "the answer that the key is declared and not modelled, on the "
      + "console and in the run's caveat block.",
    note: "Refusing would break a case whose author declared two years on "
      + "purpose: an engineer's judgement overriding the author's.  "
      + "Implementing the draw-down MOVES a published number, which is a "
      + "scientific decision belonging to whoever answers for the case, not "
      + "to whoever noticed the gap.  Announcing states the gap and moves "
      + "nothing.  When you find a discrepancy you are not authorised to "
      + "resolve, the professional act is to make it VISIBLE and route it "
      + "to whoever owns it — not to quietly fix it, and not to say "
      + "nothing.",
  },
  {
    n: 6,
    title: "What a cost estimate is allowed to claim",
    body: "Estimates carry CLASSES, and the class is part of the number.  A "
      + "study-grade estimate built from equipment correlations of the kind "
      + "this engine uses is conventionally quoted at around ±30 %; a "
      + "definitive estimate, built from vendor quotations and detailed "
      + "engineering, tightens that considerably.  Quoting a "
      + "correlation-built figure without its class is the same error as "
      + "quoting a temperature without its uncertainty, and it is the error "
      + "the twelve digits above invite.",
    note: "This page deliberately does not give you a table of class "
      + "tolerances.  The bands differ by industry and by the body defining "
      + "them, and a number invented here to look authoritative would be "
      + "exactly what the page argues against.  Look up the classification "
      + "your discipline uses and cite it.",
  },
] as const;

export function NumberNobodyCheckedTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap={14}>
        <Box>
          <Title order={3}>The number nobody checked</Title>
          <Text size="sm" mt={4}>
            A capital cost is easy to compute and hard to defend.  This page
            takes one net present value out of this simulator's own corpus,
            walks it back to the assumptions it rests on, and finds the one
            that does not hold — then asks the question a viva panel asks
            and a project sponsor asks: <strong>who answers for this
            number?</strong>
          </Text>
        </Box>

        <Alert variant="light" color="orange" title="Everything here is real">
          <Text size="sm">
            The case is <Code>{NPV_FACTS.case_}</Code>, it ships in this
            corpus, and the figures are quoted from its golden and its own
            dictionaries rather than invented for a lesson.  Nothing on this
            page is computed in the browser.
          </Text>
        </Alert>

        {NNC_STEPS.map((s) => (
          <Box key={s.n}>
            <Title order={5}>{s.n} · {s.title}</Title>
            <Text size="sm" mt={4}>{s.body}</Text>
            {"note" in s && s.note && (
              <Box mt={6} px="sm" py={6}
                style={{ borderLeft: `3px solid ${GRID}` }}>
                <Text size="sm" c={INK}>{s.note}</Text>
              </Box>
            )}
          </Box>
        ))}

        <Box>
          <Title order={5}>Why this is on an engineering syllabus at all</Title>
          <Text size="sm" mt={4}>
            Because the failures that matter in industry are mostly of this
            shape.  The large process disasters were not calculation errors:
            they were a permit that did not survive a shift handover, a
            temporary modification nobody re-reviewed, a deviation that
            became normal because it had not yet hurt anyone.  Every one is
            a fact that somebody knew and that did not reach the person who
            needed it — which is the same failure as a declared key nothing
            reads, differing only in what it costs.
          </Text>
          <Text size="sm" mt={6}>
            You will meet this simulator refusing to answer, announcing what
            it assumed, and naming what it could not model.  That is not
            fussiness about software.  It is the same discipline, practised
            where the stakes are only a wrong number.
          </Text>
        </Box>

        <Text size="xs" c={INK}>
          Engine: <Code>src/postProcessing/EconomicsPass.cpp</Code> ·{" "}
          <Code>src/postProcessing/costing/Guthrie.cpp</Code> ·{" "}
          <Code>src/core/DictAudit.H</Code>
        </Text>
      </Stack>
    </Box>
  );
}
