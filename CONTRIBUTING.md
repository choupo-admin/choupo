# Contributing to Choupo

Thanks for your interest in Choupo — an open, glass-box chemical
process simulator for teaching and research.

## Licence of contributions

Choupo source code, cases, tests, and machine-readable examples are licensed
under the **GPL-3.0-or-later**. Contributions are for code, cases, tests,
models, validation material, and executable examples.

The guides/manuals under `docs/` are authored, curated, and editorially
maintained by Vítor Geraldes and Pedro Mendes — except the Developer Guide,
authored by Vítor Geraldes alone. Their prose, figures, and
explanatory text are licensed as a published documentary work under
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**,
while code excerpts, case files, and other machine-readable examples inside
them remain GPL-3.0-or-later. External contributions do not create guide
authorship.

By submitting a contribution (a pull request, a patch, or material you ask to
have included), you agree that your contribution is licensed under
GPL-3.0-or-later, and you confirm that **you have the right to license it that
way** -- i.e. the contribution is yours, or whoever owns it (for example your
institution) permits this.

You keep the copyright to your contribution; it is simply licensed under
GPL-3.0-or-later like the contributed project material. There is **no CLA**
and no copyright assignment -- the inbound licence equals the outbound
licence. Add your name to [`AUTHORS`](AUTHORS) in your first pull request.

## Authorship and sign-off

Contributions must be **signed off** under the
[Developer Certificate of Origin](https://developercertificate.org/) — a
one-line statement that you have the right to submit the contribution under
the project's licence. It is **not** a copyright assignment; you keep your
copyright (see above).

Sign off each commit by committing with `-s`:

    git commit -s -m "your message"

which appends a line with your real name and a reachable email:

    Signed-off-by: Your Name <your.email@example.com>

That line is all the DCO requires.

The sign-off is also part of Choupo's authorship record.  Do not squash
away another contributor's commits or remove their `Signed-off-by` lines
without their explicit consent.  For substantial contributions, keep the
author's commit author metadata, add them to `AUTHORS`, and add a copyright
line in new source files they create.

## Trademark and brand

The GPL-3.0-or-later licence covers the **code, cases, tests, executable
examples, models, and validation cases**. CC BY-SA 4.0 covers the manual prose
and figures under `docs/`, authored by Vítor Geraldes and Pedro Mendes.
Neither licence covers the project's identity. The **"Choupo"
name, together with the project's logos, icons, SVG marks, wordmarks, and
other brand assets, is a trademark of TalentGround Lda.** (the founder's
family holding) and is **not** granted by the code's open-source licence
(no FOSS licence grants trademark rights).  The *code* copyright remains with Vítor Geraldes
(the author); the *name* belongs to the holding --- two distinct rights.

You may use the name to refer to the project (e.g. "built with Choupo").
However, contributions that add or change logos or brand assets, and any use
that could imply endorsement, require the maintainer's explicit approval.

## Source-file header

Every source file (C++ `.H`/`.cpp`, the GUI's `.ts`/`.tsx`, and the `bin/`
scripts) starts with the Choupo header: the CHOUPO banner, the GPL-3.0-or-later
notice, an **`SPDX-License-Identifier: GPL-3.0-or-later`** line (so licence scanners
read it reliably), pointers to `AUTHORS` + `NOTICE`, and a one-line
**Description**.  The canonical template is [`etc/header.txt`](etc/header.txt).

For a new file, stamp it automatically:

    bin/header path/to/NewFile.H "one-line description of what it does"

It fills the year and your name (from `git config user.name`) and leaves the
Description for you to edit; it picks the comment style (`/* … */` for C/TS,
`# …` for scripts) and skips files that already have a header.  Verify with
`bin/header --check <files>`.

You keep **your own copyright**: a file you write carries
`Copyright (C) <year> <your name>` — that line is per author, not assigned to
anyone.  Do **not** overwrite an existing author's copyright line; if you make a
major change to their file, add yours beneath it.  Always keep the
`SPDX-License-Identifier` line (it is what makes the licence machine-readable).

## How to contribute

1. Fork the repository and create a branch.
2. Make your change. Match the project's style — read `CLAUDE.md` and
   look at an existing unit operation before adding a new one.  New files start
   with the Choupo header (`bin/header <file> "…"`, see above).
3. Run the full regression: `bin/runTests`.
4. Commit with `git commit -s` so each commit is signed off (DCO, see above).
5. Open a pull request describing what it does and why.

Questions, ideas, and "is this a good idea?" are welcome as issues
*before* you write code — especially for new unit operations or
architectural changes.
