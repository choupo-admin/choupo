# The order a reader meets a reference

*2026-09-19.  Record of a review of the Theory Guide by Pedro Mendes,
co-author and curator of the guides, against `Choupo-2608` — the release a
reader downloads today.  Three of his findings are acted on here; one is
measured and left for a decision; one belongs to an immutable tag and is
RESERVED for Vítor.*

---

## 1. What was reported, and what was measured

Pedro sent three points.  Each was verified against the tree before anything
was changed, and one of the three turned out to have a cause other than the
obvious one.

| Reported | Measured |
|---|---|
| "the first references cited are 73 and 76 (p. 3)" | Exact.  `Choupo-2608`'s printed page 3 renders `[73]` and `[76]`; at HEAD the same two sentences rendered `[79]` and `[82]`, because the bibliography grew by six entries in between |
| "figure captions are in a larger font than the body text" | Not as stated, and the real cause is more interesting — §3 |
| "bibliographic references are missing; in a glass-box spirit every equation, hypothesis and datum should be referenced systematically" | Right, and §4 sizes it |

---

## 2. The bibliography order — the design, and the two routes rejected

### The defect is a DERIVED FACT with a hand-maintained home

`docs/theoryGuide.tex` carries a manual `\begin{thebibliography}{99}` with 83
`\bibitem`s.  **LaTeX numbers those in source order**, so the order the
entries happen to be written in *is* the numbering the reader sees.  Nothing
tied that order to the order the body cites them.

Measured at HEAD before the fix: of the 2701 ordered pairs of cited entries,
**1778 were inverted** against citation order.  The first citation in the body
was entry #79 of 83, the second #82, the third #65.

It is a derived fact — a function of the body text — and the project's own
arity doctrine forbids storing one by hand.  That is also why *hand-sorting
once* is not a fix: it is correct until the next citation is added, and then
every number after it moves again.

### The scope is one guide, and that was checked rather than assumed

The brief that commissioned this work asked whether the other seven guides
share the defect, on the reasoning that a fix serving one guide and leaving
seven is half a fix.  Measured: **`theoryGuide.tex` is the only source in
`docs/` that carries a bibliography at all.**  The other seven guides contain
zero `\bibitem` and zero `\cite`.  So the ordering defect has exactly one
instance — and the *absence* of any bibliography in the other seven is a
different finding, belonging to §4 rather than to this one.

### The route taken

`bin/curate/gen_theory_bibliography.py` — the project's own generator idiom
(`gen_tutorials_guide.py`, `gen_sdem_validation.py`): it computes the order
from the body and rewrites the block in place; `--check` is the gate, wired
into `bin/runTests` as `theory-bibliography-gate`.

The rule: an entry's position is its **first citation in the body**, scanning
the file top to bottom, a multi-key `\cite{a,b}` counted left to right.  A
`\cite` *inside* a bibliography entry is a cross-reference, not a reading-order
event, and is ignored — there is exactly one in the tree
(`GeraldesAfonso2010`), and letting it count would let the bibliography decide
its own order.

**Only the order is derived.**  The entries' text is hand-written curation and
is moved verbatim.  Measured after the first run: all 83 entries are
byte-identical modulo whitespace, and every byte outside the environment is
untouched.  The file stays the entries' one home; the script is a normaliser
over it, not a generated view of something else.

It refuses (exit 1, nothing written) on three things LaTeX renders quietly: a
`\cite` with no `\bibitem` (a bare `[?]`), a duplicate `\bibitem` key (one of
the two unreachable), and a missing environment.

Rendered result: `[1]` Westerberg, `[2]` CAPE-OPEN, `[3]` Wegstein, on the
same page as before.

### Route 1 — BibTeX / biblatex with an `unsrt`-like style: REJECTED

Numbering would follow first citation *by construction*, which is the
strongest form of the property.  Three costs, and the third is decisive.

1. **It adds a pass to a two-pass build.**  `docs/Makefile` runs `pdflatex`
   exactly twice per guide and nothing else; `.github/workflows/publish-site.yml`
   installs `texlive-latex-recommended texlive-latex-extra texlive-pictures
   texlive-fonts-recommended lmodern` with `--no-install-recommends`.  Whether
   `bibtex` lands in that set is a guess, and `bin/buildSite` REFUSES on a
   failed docs build — so a wrong guess stops the site publishing, which is the
   2026-08-27 failure mode this project has already paid for once.
2. **It requires migrating 83 entries into a foreign format.**  These entries
   are not `author/title/year` triples: most carry a sentence of curation prose
   saying which equation in the manual rests on them ("The pellet balance
   Eq. (…), the modulus Eq. (…) and the closed forms Eqs. (…)–(…)").  In BibTeX
   they would become `note={}` fields, and `unsrt` would reformat every entry —
   a lossy rewrite of hand-curated text, to fix an ordering.
3. **It would silently delete six references.**  Six entries are cited nowhere
   (§2.1 below).  Under `unsrt` an uncited entry is simply not printed: the
   manual would lose them with nothing anywhere saying so.  Deleting a curated
   reference is the guide authors' act, not a bibliography style's.

### Route 3 — a hand-sorted bibliography: REJECTED

Named for completeness because it is the obvious move: it is a second home for
a derived fact, correct until the next citation, and the project forbids it by
name.

### 2.1  Six entries are cited nowhere — kept, moved last, named

`HenleySeader`, `Strathmann2004`, `BardFaulkner2001`, `Watson`, `Michelsen`,
`GVL`.  They render as `[78]`–`[83]` and no number in the text points at them.

They are KEPT.  Removing a curated reference is a curation act; and several of
them are works the manual arguably *ought* to cite — `Michelsen` under the
stability test the engine implements, `Watson` under the latent-heat
correlation it uses by that name.  Adding those citations is §4's campaign and
is not taken here.  The generator places them after the cited entries under a
marker comment and names them on its own claim line, so the gap is visible on
every run rather than invisible in a rendered PDF.

**This is a decision for Pedro and Vítor, not for a generator: cite them, or
drop them.**

### 2.2  Sabotages

Four, by hand, all caught; the tree was restored byte-identical after each.

| # | Sabotage | Result |
|---|---|---|
| S1 | the pre-fix source order restored wholesale | DRIFT, remedy named |
| S2 | two adjacent cited entries swapped | DRIFT — so it is not a coarse "did anyone run it" check |
| S3 | a `\cite` pointed at a key with no entry | REFUSED, key named |
| S4 | an entry's key duplicated | REFUSED, key named |

---

## 3. The captions — the obvious cause is not the cause

`docs/theoryGuide.tex` is `\documentclass[11pt,a4paper]{article}`, and
`docs/preamble.tex` loaded **no `caption` package and set no `\captionsetup`**.
So the caption size had never been decided by anyone: it was the class default,
which in `article` is the body size *exactly*.  Probed out of LaTeX rather than
argued:

```
BODY    = 10.95pt   CAPTION = 10.95pt   (before)
BODY    = 10.95pt   CAPTION = 10pt      (after, font=small)
```

Pedro perceives them as larger, and the measurement says why he is right about
the page even though the ruler says the sizes are equal:

* **All 92 of the Theory Guide's figures are DRAWN** (tikz / pgfplots; the
  guide imports no images).  **79 of the 92 label their own interior at
  `\footnotesize` and 75 use `\scriptsize`** — 9pt and 8pt.
* **Every one of the 92 captions is a paragraph, not a title.**  Shortest 262
  characters, median 684, mean 675, longest 981.  All 92 exceed 200.

A six-line body-size paragraph sitting under an 8–9pt drawing reads as
oversized whatever the ruler says.  The contrast is with the *graphic*, not
with the body text — and there was no caption setting to be wrong, which is
the part worth recording: **nobody had chosen.**

There is a choice now: `\usepackage[font=small,labelfont=bf]{caption}` in the
shared preamble — one step below the body, the ordinary scholarly convention.
It is shared deliberately: `preamble.tex` serves all eight guides, and captions
exist in theoryGuide (92), designGuide (3), propsGuide (2) and the generated
tutorialsGuide SDEM parts (5).  One manual set, one caption size.  All eight
were rebuilt and read back.

Measured rather than asserted, three ways.  The Theory Guide's build reports
the **same 81 Overfull boxes and the same single oversized float** before and
after, so nothing reflowed badly; it loses 3 pages (323 → 320); and read back
out of the two rendered PDFs on the same page (31, Figure 1), the caption's
word boxes fall from 9.63 to 8.80 — a ratio of 0.914 against the 10/10.95 =
0.913 the declaration asks for — while the body's are unchanged at 11.66.  The other seven are
unchanged in page count.

**Not done:** no caption *width*, *skip* or *justification* was touched, and no
figure's interior font was changed.  If Pedro still reads the captions as
heavy, the next lever is the paragraph length, which is editorial.

### 3.1  Found while rebuilding: a cross-reference to a label that never existed

The electrodialysis chapter says "the whole apparatus of
`\S\ref{sec:ed-multiionic}` delivers a single number", and no such `\label`
existed anywhere.  LaTeX renders an unknown reference as `??` and reports it
only as a warning on the second pass, which the Makefile does not act on — so
the guide has been shipping "the whole apparatus of §?? delivers a single
number".

The target is not a guess: the subsection three above it is titled "The
multi-ionic limiting current, predicted", it is the only place that prediction
is derived, and the citing sentence describes what it computes.  It simply
never carried a label.  Labelled; the reference resolves to §21.7 and the build
reports zero undefined references.

**The general fact underneath:** `check_guide_environments`, `check_guide_paths`
and `check_lesson_symbols` all read these sources and **none of them resolves a
`\ref`**.  Only the compile can, and its verdict is a warning nothing reads.
Whether to gate that is a separate decision and is not taken here.

---

## 4. The major point, MEASURED — not attempted

> *"falta de referências bibliográficas.  No espírito glass-box, acho que todas
> as equações, hipóteses físico-químicas e dados deviam ser referenciados
> sistematicamente.  Na versão atual, acontece esporadicamente."*

He is right, and this project already does exactly that everywhere *except* the
guides: records cite a primary source per value (`check_source_licence`,
`check_species_citation`); a correlation is an object carrying a citation, a
validity window and a verification anchor; every EduTool lesson symbol needs a
mechanically verified `file:line` citation into the engine
(`check_lesson_symbols`, waiver dict kept EMPTY).  **The Theory Guide has no
equivalent gate.**  The campaign is NOT started here — it is large and it is
Vítor's to authorise.  What follows is the measurement that turns it into a
sized proposal.

### 4.1  The numbers

Measured on `docs/theoryGuide.tex` at this commit (26,672 lines, 320 rendered
pages):

| | |
|---|---|
| numbered equation environments (outside the bibliography) | **534** |
| numbered equation *tags* they produce (`align` rows counted, `\nonumber` subtracted) | **566** |
| `\cite` commands in the body | **105** |
| key occurrences (multi-key cites expanded) | **113** |
| distinct keys cited | **77** |
| `\bibitem` entries | **83** |
| entries cited nowhere | **6** |
| cites with no entry | **0** |

Proximity of an equation to a citation — a deliberately generous proxy, since
a citation anywhere near an equation counts:

| a `\cite` within | equation environments reached |
|---|---|
| 5 lines | 48 / 534 (**9 %**) |
| 10 lines | 81 / 534 (**15 %**) |
| 20 lines | 113 / 534 (**21 %**) |
| 40 lines | 161 / 534 (**30 %**) |

### 4.2  The sporadic-ness is CONCENTRATED, not uniform

This is the finding that changes the shape of the campaign.

* 79 `\section`s; **56 carry at least one numbered equation**.
* **44 of those 56 carry ZERO citations.**
* The **four** chapters with the most citations hold **63 of the 105** cite
  commands.

The chapters with the most equations and no citation at all:

| numbered eqs | chapter |
|---|---|
| 19 | From component data to integral properties |
| 15 | Fugacity and the vapour phase |
| 12 | Ideal mixing |
| 12 | Feedback control: the ideal PID, derivative-on-PV, anti-windup |
| 11 | Gibbs reactor: equilibrium by free-energy minimisation |
| 10 | Shortcut distillation: Fenske–Underwood–Gilliland |
| 9 | Liquid-liquid equilibrium by Gibbs minimisation |
| 9 | Drying: spray dryer and solid dryer |

The sixth row is the one to read twice: a chapter that **names three people in
its own title** and cites none of them.

So the campaign is not "sprinkle citations evenly".  It is: **44 chapters have
no bibliographic anchor at all, and four chapters carry most of the manual's
scholarship.**  That is a per-chapter task list, not a per-equation sweep.

### 4.3  The citation usually EXISTS IN THE TREE and did not reach the guide

The brief asked whether equations reproduce a source the *engine* already
cites — whether the work is *writing* citations or *moving* them.  Sampled 47
named works that the engine carries (transport correlations, friction
correlations, EOS, estimation methods, costing):

* **27 of the 47 are absent from the guide's bibliography.**
* **22 of those 27 are NAMED IN THE GUIDE'S OWN PROSE** while the engine holds
  the full citation: Nusselt, Blasius, Svehla, Bromley, Neufeld, Chung, Eucken,
  Fuller, Andrade, Vogel, Sato, Riedel, Hermia, Wertheim, Joback, Lee, Kesler,
  Rackett, Wilke, Hirschfelder, Dittus, Ergun.  A twenty-third, Sieder, is
  named in the guide and appears nowhere in `src/`: the guide teaches
  Sieder-Tate as one of two "workhorses" beside Dittus-Boelter, and
  `HeatTransferCorrelation` registers `DittusBoelter`, `Gnielinski` and
  `Kern`.  Recorded as measured; the passage is textbook teaching and does
  not claim the engine implements it, so nothing is changed here.

So for roughly **half the sample the citation is a MOVE, not a search**:
`src/thermo/transport/ChungViscosity.H` carries the full reference behind
`citation()`, and the chapter that teaches Chung's correlation names Chung and
cites nothing.

Two coarser counts, offered with their noise stated — the matcher is a
surname+year heuristic over comments and it produces false positives such as
"Coefficients 2012":

* **69 engine source files** carry a year-bearing bibliographic comment;
* **112** distinct (surname, year) pairs appear in engine comments against
  **58** in the guide's bibliography, with **1** exact overlap by that matcher.

### 4.4  What a `check_theory_citations` gate could plausibly assert

Sized from the above, and stated with its limits because a gate that implies
more than it checks is worse than one that reports less.

**Could assert, mechanically:**

* **C1 — chapter coverage.**  Every `\section` carrying a numbered equation
  carries at least one `\cite`.  Today: 44 of 56 fail.  This is the one arm
  that is both checkable and load-bearing, and it is a per-chapter debt list
  that can RATCHET (the `check_energy_closure` shape: a measured pin list,
  seeded not typed, where a debt that grows fails and one that closes fails
  asking for its pin back).
* **C2 — no dangling, no orphan.**  Every `\cite` resolves to a `\bibitem`
  (already in the generator, exit 1) and every `\bibitem` is cited.  The
  second is today a REPORT, not a refusal, because the six uncited entries are
  a curation decision (§2.1).
* **C3 — the engine's own citations reach the guide.**  A work whose surname
  the guide's prose names, and which the engine cites in a `citation()` or a
  header, has a bibliography entry.  This is the arm §4.3 makes cheap: the
  source of truth already exists in `src/`.
* **C4 — a named model has a source.**  Every model key registered in a factory
  and taught in the guide resolves to a cited entry.

**Could NOT cover, and the gate must say so on its own claim line:**

* **Whether a citation is TRUE of the equation beside it.**  A `\cite` five
  lines from an equation proves adjacency, not provenance.  No gate here can
  read a paper.  This is exactly the limit `check_lesson_symbols` lives with,
  and it is why that gate verifies `file:line` into the *engine* rather than
  into the literature.
* **Whether an equation NEEDS a citation.**  A derivation step, a definition,
  and a restatement of the first law do not; a correlation does.  Nothing
  mechanical separates them, so C1 is per-CHAPTER and not per-equation — a
  per-equation arm would accuse the innocent, and *a gate that accuses the
  innocent teaches the reader to ignore it* (2026-09-04).
* **The hypotheses.**  Pedro's word was *hipóteses físico-químicas*, and a
  stated modelling assumption is prose.  No gate proposed here sees one.
* **The 566 equation tags as such.**  The proxy above counts environments and
  proximity; it has no model of which tag belongs to which claim.

**Estimated cost, for the authorisation decision:** C2 and C3 are days, because
their source of truth is already in the tree.  C1 is the campaign — 44 chapters
of reading against primary sources, which is curation and is the guide authors'
work, not an assistant's.  Inventing a citation converts *unsourced* into
*falsely sourced*, which no reader and no gate can detect.

---

## 5. RESERVED for Vítor — `theoryGuide-STIFF-METHODS.pdf` is in the `v2608` tag

Stated precisely so the decision can be taken on facts rather than memory.  All
four were verified.

* The file was **removed from `main`** on 2026-09-03 in `d20807e02`, the commit
  that created `check_guide_pdf_fresh` — as its own second arm's first catch: a
  top-level `docs/*.pdf` that no `docs/Makefile` rule builds is a manual with
  no source, outside every source gate at once.
* **It is present in the `v2608` tag** (`docs/theoryGuide-STIFF-METHODS.pdf`,
  blob `1f0653a17e`, 202 pages), which is the release Pedro reviewed and the
  release a reader downloads today.
* Its own title page says **"Version v0.2.0"**, and its text names **Aspen (4
  occurrences) and HYSYS (1)** — which the manuals doctrine (settled
  2026-07-03, philosophy §4, enforced by `check_doctrine`) forbids in a
  user-facing manual.
* **It never reached choupo.org.**  `bin/buildSite` and
  `gui/scripts/copyDocs.mjs` both stage only the guides in `docs/Makefile`'s
  `DOCS` list, and this is not one.  Its reach is the git tag and therefore
  GitHub's source archive of the release.

**Nothing was done about it and nothing is proposed in code.**  A tag is
immutable by Vítor's own rule; two exceptions are already on record (the `v2607`
withdrawal, 2026-09-02; the `v2608` fold, 2026-09-03) and both were his
decision, taken on the argument that nobody could have relied on what was moved.
That argument is *not* available here: `v2608` has been published, served and
downloaded since 2026-09-03.

The options, without a recommendation, because this is a decision about a
published release:

1. Leave it.  It is source-archive only, not served, and the record now says so.
2. Note it in the release notes, so a reader who opens it knows it is a
   withdrawn v0.2.0 draft and not part of `Choupo-2608`.
3. A third tag exception.  Against everything in `RELEASING.md` and §2 of
   `CLAUDE.md`, and named here only so it is not later thought to have been
   overlooked.

---

## 6. What was NOT done

* **No citation campaign.**  §4 is a measurement and a proposal; nothing was
  written into the guide.
* **No reference invented, deleted or re-attributed.**  The six uncited entries
  are kept and named.
* **No `check_theory_citations`.**  The generator gate covers ORDER only, and
  says so on its claim line.
* **No `\ref` gate** (§3.1), and no change to any other guide's prose.
* **No golden touched.**  A manual has none, and nothing outside `docs/`,
  `bin/curate/` and the one `bin/runTests` wiring block moved.
