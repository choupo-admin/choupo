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

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  guideLinks -- THE ONE HOME for "the URL that opens a guide at a section",
  and THE ONE WAY to open it.

  It exists because there were SIX.  helpMap (F1), modelDocs (unit ops, props
  ops, models), the EduTools registry, ExploreWorkspace, PropsView and four
  literals in MenuBar each built their own `docs/<guide>.pdf#nameddest=<x>`.
  Six homes for one derived quantity is the arity sin, and it had the exact
  consequence the doctrine predicts: the F1 path was fixed, the fix could not
  reach the button the bug report was pointing at, and the report came back a
  third time.

  TWO decisions live here, and nowhere else.

  1.  WHAT the URL is.  Not the PDF -- `guide.html?g=<guide>#nameddest=<x>`,
      the page that DRAWS the manual instead of handing it to the browser's
      PDF handler.  Handing it over is what produced "it downloads the whole
      file instead of opening the page": the site is on GitHub Pages, which
      gives no header control, and a Firefox profile set to save PDFs
      overrides the page's intent anyway.  The reasoning, the measurements and
      what this deliberately does NOT solve are in
      `docs/design/help-opens-in-a-tab-not-a-download.md`; the viewer itself
      is `gui/public/guide.html`.

  2.  HOW it opens.  `openGuide` opens a real TAB.  The previous form,
      `window.open(url, "_blank", "noopener")`, passes a non-empty
      windowFeatures string, and a non-empty features string asks the browser
      for a POPUP WINDOW -- so every Help-menu entry opened the one thing the
      report said it should not.  Omitting the third argument is the whole
      fix: browsers have implied `noopener` for `_blank` since 2021, and the
      returned handle is severed here anyway for the older ones.
\*---------------------------------------------------------------------------*/

/** The four manuals, by the bare name `guide.html?g=` expects. */
export type GuideName = "theoryGuide" | "propsGuide" | "userGuide" | "developerGuide";

/** Accept either `theoryGuide` or `theoryGuide.pdf` -- callers historically
 *  carried both spellings, and a link is not the place to be fussy about it. */
function bareName(guide: string): string
{
    return guide.endsWith(".pdf") ? guide.slice(0, -4) : guide;
}

/** The URL that opens `guide` in the Choupo viewer, at `anchor` when given.
 *
 *  `anchor` is a REAL `\label{...}` from the corresponding .tex (the preamble
 *  sets `destlabel=true`, so every label is a PDF named destination).  Passing
 *  a label the guide does not define lands the reader at the top of the
 *  manual rather than at their answer, which is why `docs/help-index.json` is
 *  checked against the .tex sources. */
export function guideUrl(guide: string, anchor?: string): string
{
    const dest = anchor ? `#nameddest=${encodeURIComponent(anchor)}` : "";
    return `${import.meta.env.BASE_URL}guide.html?g=${bareName(guide)}${dest}`;
}

/** The URL that downloads the PDF itself.  Kept, and kept SEPARATE: the
 *  download is a legitimate thing to want, and it should happen because
 *  somebody asked for it rather than because they wanted to read. */
export function guidePdfUrl(guide: string): string
{
    return `${import.meta.env.BASE_URL}docs/${bareName(guide)}.pdf`;
}

/** Open a URL in a new TAB.  See decision 2 in the header for why the third
 *  argument of `window.open` must stay absent. */
export function openGuide(url: string): void
{
    const w = window.open(url, "_blank");
    if (w) w.opener = null;
}
