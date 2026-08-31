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
  The discipline shelves (owner, 2026-08-30: "Os EduTools estão a ficar
  longos" -- 23 tools had outgrown a flat list).  These pins hold the
  contract, not the taxonomy: every tool sits on a shelf from the ONE
  ordered list, no shelf is empty (an empty shelf is a label with nothing
  under it), and no shelf holds the whole list (a single shelf would be
  the flat list wearing a heading).  WHICH shelf a tool belongs on is an
  editorial judgement the registry owns; a test that pinned it would have
  to be edited every time the judgement is exercised.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";


/*---------------------------------------------------------------------------*\
  A CRASH REPORT MUST SAY SOMETHING.  On 2026-08-31 the owner sent a render
  error from the live site whose trace block was EMPTY, and an hour went
  into probing a page that could not be reproduced -- because the report
  carried no message, no tool and no workspace.

  The cause was `error.stack ?? error.message`: `??` falls back only on
  null/undefined, and an EMPTY-STRING stack is not nullish, so it passed
  through and rendered a void that looks exactly like a report.

  Pinned as SOURCE TEXT.  What that can and cannot do, said plainly: it
  proves the fallback is written by emptiness rather than by nullishness,
  and that the address bar is read into the report.  It does NOT render the
  boundary (this project ships no jsdom) and so cannot prove the output is
  useful -- only that the two defects that produced an empty report are not
  back in the source.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  new URL("../src/ui/ErrorBoundary.tsx", import.meta.url), "utf-8");

describe("the crash report is never empty", () => {
  it("does not fall back with ?? alone, which an empty string defeats", () => {
    expect(SRC, "`error.stack ?? error.message` is back: an empty-string "
      + "stack is not nullish, so it passes through and the report renders "
      + "blank — which is what the owner received")
      .not.toMatch(/error\.stack\s*\?\?\s*this\.state\.error\.message/);
  });

  it("falls back on EMPTINESS, through to a sentence", () => {
    expect(SRC, "no emptiness-aware fallback found").toMatch(/trim\(\)/);
    expect(SRC, "a thrown non-Error must still produce a sentence rather "
      + "than a void").toMatch(/neither a stack nor a message/);
  });

  it("names where the reader was, which no earlier report carried", () => {
    expect(SRC, "the report must read the deep-link contract: a Suspense "
      + "boundary hides the lazy component's name, so the tool id has to "
      + "come from the address bar").toMatch(/searchParams\.get/);
    for (const k of ["workspace", "tool"])
      expect(SRC, `the report should carry "${k}"`).toContain(`"${k}"`);
  });

  it("cannot itself throw while reporting a throw", () => {
    //  A boundary that crashes while describing a crash leaves the reader
    //  with nothing at all -- strictly worse than the empty block.
    const where = SRC.slice(SRC.indexOf("let where"));
    expect(where, "the address-bar read must be wrapped in try/catch")
      .toMatch(/try\s*\{[\s\S]*catch/);
  });
});
